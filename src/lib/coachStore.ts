import { useEffect, useState } from "react";
import { analyze } from "@/lib/blog";
import { dailyTotals, fmtMoney, symbolGroups, type Dataset } from "@/lib/pnl";
import { generateCoachReview, type CoachReview } from "@/lib/coach";

const KEY = "pnl-coach-review-v1";

/** Cheap identity for the imported dataset — changes only when the trades do. */
export function coachFingerprint(data: Dataset): string {
  const last = data.fills[data.fills.length - 1];
  return [
    data.closed.length,
    data.fills.length,
    Math.round(data.totalFees ?? 0),
    last?.date ?? "",
    last?.ts ?? 0,
  ].join(":");
}

/** The plain-text brief Claude reviews. Kept compact and factual on purpose. */
function buildBrief(data: Dataset): string {
  const a = analyze(data);
  const m = a.m;
  const money = (n: number) => fmtMoney(n);
  const lines: string[] = [];

  lines.push("=== AGGREGATE ===");
  lines.push(
    `Net ${money(m.net)} | gross ${money(m.gross)} | commissions ${money(-m.fees)}`,
    `Trades ${m.tradeCount} (${m.wins}W / ${m.losses}L) | win rate ${(m.winRate * 100).toFixed(0)}%`,
    `Avg win ${money(m.avgWin)} | avg loss ${money(-m.avgLoss)} | payoff ${m.payoff.toFixed(2)}x`,
    `Profit factor ${m.profitFactor === Infinity ? "inf" : m.profitFactor.toFixed(2)} | expectancy ${money(m.expectancy)}/trade`,
    `Largest win ${money(m.largestWin)} | largest loss ${money(-m.largestLoss)}`,
    `Sessions ${m.tradingDays} | green-day rate ${(m.dayWinRate * 100).toFixed(0)}% | max drawdown ${money(-m.maxDrawdown)}`,
    `Top day = ${(m.topDayShare * 100).toFixed(0)}% of net | top ticker = ${(m.topTickerShare * 100).toFixed(0)}% of net`,
    `Sample is ${a.enoughData ? "large enough for a real read" : "small — treat as provisional"}.`,
  );

  const bucket = (label: string, xs: string[]) => {
    if (xs.length)
      lines.push("", `=== ${label} (heuristic engine) ===`, ...xs.map((x) => `- ${x}`));
  };
  bucket("WHAT LOOKS GOOD", a.goods);
  bucket("WHAT LOOKS COSTLY", a.bads);
  bucket("WATCH", a.watch);
  bucket("HEURISTIC ADVICE", a.advice);

  const days = [...dailyTotals(data).entries()].sort(([x], [y]) => x.localeCompare(y));
  lines.push("", "=== DAILY P&L ===");
  for (const [d, v] of days) {
    lines.push(
      `${d}: ${money(v.pnl)}  (${v.trades}T ${v.wins}W ${v.losses}L, fees ${money(-v.fees)})`,
    );
  }

  const syms = symbolGroups(data);
  lines.push("", "=== PER-TICKER P&L ===");
  for (const g of syms) {
    lines.push(
      `${g.symbol}: ${money(g.pnl)}  (${g.rows.length} instrument(s), fees ${money(-g.fees)})`,
    );
  }

  return lines.join("\n");
}

export type CoachState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; review: CoachReview }
  | { status: "error"; message: string }
  | { status: "no-key" };

/**
 * Returns the Claude-written review for the current dataset. Cached in
 * localStorage against the dataset fingerprint, so it only calls the model when
 * the imported trades actually change.
 */
export function useCoachReview(data: Dataset | null): CoachState {
  const fp = data && data.closed.length > 0 ? coachFingerprint(data) : null;
  const [state, setState] = useState<CoachState>({ status: "idle" });

  useEffect(() => {
    if (!data || !fp) {
      setState({ status: "idle" });
      return;
    }

    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { fp: string; review: CoachReview };
        if (cached.fp === fp) {
          setState({ status: "ready", review: cached.review });
          return;
        }
      }
    } catch {
      /* ignore cache */
    }

    let cancelled = false;
    setState({ status: "loading" });
    generateCoachReview({ data: { brief: buildBrief(data) } })
      .then((review) => {
        if (cancelled) return;
        try {
          window.localStorage.setItem(KEY, JSON.stringify({ fp, review }));
        } catch {
          /* ignore */
        }
        setState({ status: "ready", review });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState(/no-key/.test(message) ? { status: "no-key" } : { status: "error", message });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fp]);

  return state;
}
