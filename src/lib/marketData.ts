import { createServerFn } from "@tanstack/react-start";
import type { BenchmarkPoint } from "@/lib/benchmarks";

/**
 * Pull daily index closes from Yahoo Finance. This runs on the server (the Node
 * process behind TanStack Start / `npm run preview` / `node .output/server`),
 * so there is no CORS problem and no API key — the browser calls this fn, the
 * server calls Yahoo. Free forever, works whenever the app is served by a real
 * server (dev included). Falls back to CSV import when there is no server.
 */

export const YAHOO_SYMBOLS: Record<string, string> = {
  SPY: "SPY",
  QQQ: "QQQ",
  NASDAQ: "^IXIC",
  DOW: "^DJI",
  RUSSELL: "^RUT",
  "S&P 500": "^GSPC",
};

type Args = { symbol: string; start: string; end: string };

export const fetchIndexHistory = createServerFn({ method: "POST" })
  .validator((d: Args): Args => ({
    symbol: String(d.symbol),
    start: String(d.start),
    end: String(d.end),
  }))
  .handler(async ({ data }): Promise<BenchmarkPoint[]> => {
    const p1 = Math.floor(Date.parse(`${data.start}T00:00:00Z`) / 1000);
    const p2 = Math.floor(Date.parse(`${data.end}T23:59:59Z`) / 1000) + 86_400;
    const sym = encodeURIComponent(data.symbol);
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${sym}` +
      `?period1=${p1}&period2=${p2}&interval=1d`;

    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
    });
    if (!res.ok) throw new Error(`Yahoo responded ${res.status}`);

    const json = (await res.json()) as {
      chart?: {
        result?: {
          timestamp?: number[];
          indicators?: { quote?: { close?: (number | null)[] }[] };
        }[];
        error?: { description?: string } | null;
      };
    };
    if (json.chart?.error) throw new Error(json.chart.error.description ?? "Yahoo error");

    const r = json.chart?.result?.[0];
    const ts = r?.timestamp ?? [];
    const closes = r?.indicators?.quote?.[0]?.close ?? [];

    const out: BenchmarkPoint[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (typeof c === "number" && Number.isFinite(c)) {
        out.push({ date: new Date(ts[i]! * 1000).toISOString().slice(0, 10), close: c });
      }
    }
    return out;
  });

/* ------------------------------------------------------------------ *
 *  Earnings dates — Yahoo `quoteSummary` (needs a cookie + crumb)     *
 * ------------------------------------------------------------------ */

const YF_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

let crumbCache: { crumb: string; cookie: string } | null = null;

async function yahooCrumb(force = false): Promise<{ crumb: string; cookie: string }> {
  if (crumbCache && !force) return crumbCache;
  const home = await fetch("https://finance.yahoo.com/", {
    headers: { "user-agent": YF_UA, accept: "text/html" },
  });
  const raw =
    typeof home.headers.getSetCookie === "function"
      ? home.headers.getSetCookie()
      : (((home.headers.get("set-cookie") && [home.headers.get("set-cookie")!]) as
          string[] | null) ?? []);
  const cookie = raw
    .map((c) => c.split(";")[0]!)
    .filter((c) => /^A[0-9]/.test(c))
    .join("; ");
  const res = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "user-agent": YF_UA, cookie },
  });
  const crumb = (await res.text()).trim();
  if (!crumb || crumb.length > 32 || /\s|<|too many/i.test(crumb)) {
    throw new Error("Yahoo crumb unavailable");
  }
  crumbCache = { crumb, cookie };
  return crumbCache;
}

export type EarningsReport = {
  date: string; // YYYY-MM-DD, the quarter's report date
  epsActual: number | null;
  epsEstimate: number | null;
  surprisePct: number | null;
};

export type EarningsInfo = {
  symbol: string;
  nextDate: string | null;
  nextIsEstimate: boolean;
  epsEstimate: number | null;
  revenueEstimate: number | null; // consensus, raw dollars
  history: EarningsReport[]; // newest first
  fetchedAt: number;
};

function emptyEarnings(symbol: string): EarningsInfo {
  return {
    symbol,
    nextDate: null,
    nextIsEstimate: false,
    epsEstimate: null,
    revenueEstimate: null,
    history: [],
    fetchedAt: Date.now(),
  };
}

type YfNum = { raw?: number; fmt?: string } | undefined;

export const fetchEarnings = createServerFn({ method: "POST" })
  .validator((d: { symbol: string }): { symbol: string } => ({
    symbol: String(d.symbol).toUpperCase().trim(),
  }))
  .handler(async ({ data }): Promise<EarningsInfo> => {
    const sym = encodeURIComponent(data.symbol);
    const hit = async () => {
      const { crumb, cookie } = await yahooCrumb();
      const url =
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${sym}` +
        `?modules=calendarEvents,earningsHistory&crumb=${encodeURIComponent(crumb)}`;
      return fetch(url, { headers: { "user-agent": YF_UA, cookie } });
    };

    let res: Response;
    try {
      res = await hit();
      if (res.status === 401 || res.status === 403) {
        await yahooCrumb(true);
        res = await hit();
      }
    } catch {
      return emptyEarnings(data.symbol);
    }
    if (!res.ok) return emptyEarnings(data.symbol); // 404 for ETFs / indexes / unknown

    const json = (await res.json()) as {
      quoteSummary?: {
        result?: {
          calendarEvents?: {
            earnings?: {
              earningsDate?: YfNum[];
              isEarningsDateEstimate?: boolean;
              earningsAverage?: YfNum;
              revenueAverage?: YfNum;
            };
          };
          earningsHistory?: {
            history?: {
              epsActual?: YfNum;
              epsEstimate?: YfNum;
              surprisePercent?: YfNum;
              quarter?: YfNum;
            }[];
          };
        }[];
      };
    };

    const r = json.quoteSummary?.result?.[0];
    if (!r) return emptyEarnings(data.symbol);

    const e = r.calendarEvents?.earnings ?? {};
    const history: EarningsReport[] = (r.earningsHistory?.history ?? [])
      .map((h) => ({
        date: h.quarter?.fmt ?? "",
        epsActual: h.epsActual?.raw ?? null,
        epsEstimate: h.epsEstimate?.raw ?? null,
        surprisePct: h.surprisePercent?.raw != null ? h.surprisePercent.raw * 100 : null,
      }))
      .filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date))
      .sort((a, b) => b.date.localeCompare(a.date));

    return {
      symbol: data.symbol,
      nextDate: e.earningsDate?.[0]?.fmt ?? null,
      nextIsEstimate: e.isEarningsDateEstimate === true,
      epsEstimate: e.earningsAverage?.raw ?? null,
      revenueEstimate: e.revenueAverage?.raw ?? null,
      history,
      fetchedAt: Date.now(),
    };
  });
