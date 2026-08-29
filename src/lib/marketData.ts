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
