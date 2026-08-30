import {
  dayRows,
  fmtMoney,
  fmtMoneyShort,
  instrumentKind,
  type Dataset,
  type DayTotal,
} from "@/lib/pnl";

/**
 * The "daily digest agent" — same spirit as the journal agent in blog.ts, but
 * zoomed in on a single trading day. Pure heuristics, no network, no model: it
 * reads the day's closed trades plus the surrounding month and writes a handful
 * of sharp, plain-language observations a desk head might drop on you at the
 * close.
 */

export type DigestTone = "good" | "bad" | "neutral";
export type DigestLine = { tone: DigestTone; text: string };

export type Digest = {
  date: string;
  /** "green" | "red" | "flat" | "quiet" (no trades). */
  mood: "green" | "red" | "flat" | "quiet";
  pnl: number;
  headline: string;
  lines: DigestLine[];
};

const abs = Math.abs;

export function dailyDigest(data: Dataset, day: string, totals: Map<string, DayTotal>): Digest {
  const t = totals.get(day);
  const rows = dayRows(data, day).filter((r) => r.qty > 0 || r.pnl !== 0);
  const pnl = t?.pnl ?? 0;

  if (!t || rows.length === 0) {
    return {
      date: day,
      mood: "quiet",
      pnl: 0,
      headline: "No trades logged",
      lines: [
        { tone: "neutral", text: "Nothing closed on this day. Sitting out is a position too." },
      ],
    };
  }

  const mood: Digest["mood"] = pnl > 0 ? "green" : pnl < 0 ? "red" : "flat";
  const lines: DigestLine[] = [];

  // --- headline ------------------------------------------------------------
  const wl = `${t.wins}W / ${t.losses}L${t.breakeven ? ` / ${t.breakeven}BE` : ""}`;
  const headline =
    mood === "green"
      ? `Green day — ${fmtMoneyShort(pnl)} on ${t.trades} trade${t.trades === 1 ? "" : "s"} (${wl})`
      : mood === "red"
        ? `Red day — ${fmtMoneyShort(pnl)} on ${t.trades} trade${t.trades === 1 ? "" : "s"} (${wl})`
        : `Flat day — ${t.trades} trade${t.trades === 1 ? "" : "s"} (${wl})`;

  // --- best / worst trade ------------------------------------------------------
  const sorted = [...rows].sort((a, b) => b.pnl - a.pnl);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (best && best.pnl > 0) {
    lines.push({
      tone: "good",
      text: `Best: ${best.label} at ${fmtMoney(best.pnl)}${
        best.avgEntry > 0 && best.avgExit > 0
          ? ` ($${best.avgEntry.toFixed(2)} → $${best.avgExit.toFixed(2)})`
          : ""
      }.`,
    });
  }
  if (worst && worst.pnl < 0 && worst.key !== best?.key) {
    lines.push({
      tone: "bad",
      text: `Worst: ${worst.label} at ${fmtMoney(worst.pnl)}. ${
        abs(worst.pnl) > (t.grossPnl || 1) * 0.5 && mood !== "green"
          ? "That one trade set the tone."
          : "Kept it contained."
      }`,
    });
  }

  // --- concentration: did one trade carry the day? --------------------------
  const winners = rows.filter((r) => r.pnl > 0);
  const grossWin = winners.reduce((s, r) => s + r.pnl, 0);
  if (
    mood === "green" &&
    best &&
    grossWin > 0 &&
    best.pnl / grossWin >= 0.6 &&
    winners.length > 1
  ) {
    lines.push({
      tone: "neutral",
      text: `${Math.round((best.pnl / grossWin) * 100)}% of the day's green came from ${best.symbol} alone — thin base under the number.`,
    });
  }

  // --- win rate vs. your own month -----------------------------------------
  const monthPrefix = day.slice(0, 7);
  const monthRows = data.closed.filter((c) => c.date.startsWith(monthPrefix));
  const monthDecided = monthRows.filter((c) => c.pnl !== 0);
  const monthWinRate = monthDecided.length
    ? monthDecided.filter((c) => c.pnl > 0).length / monthDecided.length
    : 0;
  const decidedToday = t.wins + t.losses;
  if (decidedToday >= 2 && monthDecided.length >= decidedToday) {
    const dayWinRate = t.wins / decidedToday;
    const delta = dayWinRate - monthWinRate;
    if (abs(delta) >= 0.15) {
      lines.push({
        tone: delta > 0 ? "good" : "bad",
        text: `Hit rate ${Math.round(dayWinRate * 100)}% vs. your ${Math.round(monthWinRate * 100)}% for the month — ${
          delta > 0 ? "a sharper day than usual." : "off your own pace."
        }`,
      });
    }
  }

  // --- activity: over-trading on a red day ----------------------------------
  const monthDayTotals = [...totals.entries()].filter(([d]) => d.startsWith(monthPrefix));
  const redDays = monthDayTotals.filter(([, v]) => v.pnl < 0);
  const avgRedTrades = redDays.length
    ? redDays.reduce((s, [, v]) => s + v.trades, 0) / redDays.length
    : 0;
  if (mood === "red" && avgRedTrades > 0 && t.trades >= avgRedTrades * 1.5 && t.trades >= 4) {
    lines.push({
      tone: "bad",
      text: `${t.trades} trades on a losing day — well above your ${avgRedTrades.toFixed(1)}-trade red-day average. Looks like chasing it back.`,
    });
  }

  // --- commission drag ----------------------------------------------------
  if (t.fees > 0 && abs(t.grossPnl) > 0) {
    const drag = t.fees / abs(t.grossPnl);
    if (drag >= 0.15) {
      lines.push({
        tone: "bad",
        text: `${fmtMoney(-t.fees).replace("-$", "$")} in commissions — ${Math.round(drag * 100)}% of the day's gross.`,
      });
    }
  }

  // --- options vs stock -------------------------------------------------------
  const optPnl = rows
    .filter((r) => instrumentKind(r.label) !== "stock")
    .reduce((s, r) => s + r.pnl, 0);
  const stkRows = rows.filter((r) => instrumentKind(r.label) === "stock");
  if (stkRows.length > 0 && rows.length > stkRows.length) {
    const stkPnl = stkRows.reduce((s, r) => s + r.pnl, 0);
    lines.push({
      tone: "neutral",
      text: `Options ${fmtMoney(optPnl)}, stock ${fmtMoney(stkPnl)}.`,
    });
  }

  // --- carryover ----------------------------------------------------------
  const carried = rows.filter((r) => r.status === "open" || r.status === "partial");
  if (carried.length > 0) {
    lines.push({
      tone: "neutral",
      text: `Carried out: ${carried.map((r) => r.symbol).join(", ")} still open at the bell.`,
    });
  }

  // --- day rank within the month ----------------------------------------------
  const ranked = [...monthDayTotals].sort((a, b) => b[1].pnl - a[1].pnl);
  const rank = ranked.findIndex(([d]) => d === day);
  if (ranked.length >= 3 && rank >= 0) {
    if (rank === 0) lines.push({ tone: "good", text: "Your best day of the month so far." });
    else if (rank === ranked.length - 1 && mood === "red")
      lines.push({ tone: "bad", text: "Your worst day of the month so far." });
    else if (rank < 3 && mood === "green")
      lines.push({ tone: "good", text: `Top ${rank + 1} day of the month.` });
  }

  if (lines.length === 0) {
    lines.push({
      tone: "neutral",
      text: `${fmtMoney(pnl)} net, ${wl}. A clean, unremarkable session — exactly what a process day looks like.`,
    });
  }

  return { date: day, mood, pnl, headline, lines: lines.slice(0, 6) };
}
