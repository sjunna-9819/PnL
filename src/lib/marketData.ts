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
 *  Earnings calendar — Nasdaq's public `calendar/earnings` endpoint   *
 * ------------------------------------------------------------------ */

/**
 * Whole-market earnings for one calendar day. Nasdaq's endpoint is free, needs
 * no key and no crumb — just a browser-ish User-Agent. (Yahoo's own market-wide
 * earnings endpoint is behind a crumb and currently returns nothing, so we use
 * Nasdaq for the calendar; per-ticker Yahoo lookups aren't needed here.)
 */

const NAS_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export type EarningsCompany = {
  symbol: string;
  name: string;
  time: "pre" | "after" | "other"; // before open / after close / unspecified
  epsForecast: number | null;
  marketCap: number | null;
};

function parseMoney(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  const neg = /^\(.*\)$/.test(t);
  const n = Number.parseFloat(t.replace(/[()$,\s]/g, ""));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

export const fetchEarningsDay = createServerFn({ method: "POST" })
  .validator((d: { date: string }): { date: string } => ({ date: String(d.date).slice(0, 10) }))
  .handler(async ({ data }): Promise<EarningsCompany[]> => {
    const url = `https://api.nasdaq.com/api/calendar/earnings?date=${data.date}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "user-agent": NAS_UA,
          accept: "application/json, text/plain, */*",
          "accept-language": "en-US,en;q=0.9",
          origin: "https://www.nasdaq.com",
          referer: "https://www.nasdaq.com/",
        },
      });
    } catch {
      return [];
    }
    if (!res.ok) return [];

    const json = (await res.json().catch(() => null)) as {
      data?: {
        rows?:
          | {
              symbol?: string;
              name?: string;
              time?: string;
              epsForecast?: string;
              marketCap?: string;
            }[]
          | null;
      } | null;
    } | null;

    const rows = json?.data?.rows ?? [];
    return rows
      .filter((r) => r.symbol)
      .map((r) => {
        const t = r.time ?? "";
        return {
          symbol: (r.symbol ?? "").trim().toUpperCase(),
          name: (r.name ?? "").trim(),
          time: /pre-market/.test(t) ? "pre" : /after-hours/.test(t) ? "after" : "other",
          epsForecast: parseMoney(r.epsForecast),
          marketCap: parseMoney(r.marketCap),
        } satisfies EarningsCompany;
      })
      .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
  });
