import { dailyTotals, fmtMoney, instrumentKind, tickerRows, type Dataset } from "@/lib/pnl";

/**
 * The "journal agent" — a deterministic analysis engine that reads the imported
 * dataset and writes dated commentary: what the trader is doing right, what is
 * costing them, and what to change. No network, no model; pure heuristics that
 * mirror well-worn trading-desk rules (expectancy, payoff, profit factor,
 * concentration, over-trading, revenge trading, sizing discipline, fee drag).
 */

export type PostTone = "good" | "bad" | "neutral";

export interface PostSection {
  heading: string;
  tone: PostTone;
  items: string[];
}

export interface Post {
  id: string;
  date: string; // yyyy-mm-dd, for display
  title: string;
  summary: string;
  grade?: string;
  score?: number;
  sections: PostSection[];
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const ratio = (n: number) => (n === Infinity ? "∞" : n.toFixed(2));
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

interface Metrics {
  net: number;
  gross: number;
  fees: number;
  feeDrag: number;
  tradeCount: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  payoff: number;
  profitFactor: number;
  expectancy: number;
  largestWin: number;
  largestLoss: number;
  lossOutlier: number;
  tradingDays: number;
  greenDays: number;
  dayWinRate: number;
  bestDay: [string, number] | null;
  worstDay: [string, number] | null;
  avgTradesGreenDay: number;
  avgTradesRedDay: number;
  maxDrawdown: number;
  topDayShare: number;
  topTickerShare: number;
  revengeDays: number;
  overnightOptions: number;
  carriedContracts: number;
  callPnl: number;
  putPnl: number;
  stockPnl: number;
  optionPnl: number;
  repeatOffenders: { symbol: string; pnl: number; days: number }[];
  bestTicker: { symbol: string; pnl: number; days: number } | null;
  sizingCV: number;
}

function metrics(data: Dataset): Metrics {
  const closedAll = data.closed;
  const closed = closedAll.filter((t) => !t.carried);
  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl < 0);
  const gross = closed.reduce((s, t) => s + t.pnl, 0);
  const fees = data.totalFees;
  const grossWins = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLossAbs = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const avgWin = wins.length ? grossWins / wins.length : 0;
  const avgLoss = losses.length ? grossLossAbs / losses.length : 0;
  const decided = wins.length + losses.length;
  const net = gross - fees;

  const daily = [...dailyTotals(data).entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const greenArr = daily.filter(([, v]) => v.pnl > 0);
  const redArr = daily.filter(([, v]) => v.pnl < 0);
  const bestDay = daily.reduce<[string, number] | null>(
    (b, [d, v]) => (!b || v.pnl > b[1] ? [d, v.pnl] : b),
    null,
  );
  const worstDay = daily.reduce<[string, number] | null>(
    (b, [d, v]) => (!b || v.pnl < b[1] ? [d, v.pnl] : b),
    null,
  );

  let cum = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const [, v] of daily) {
    cum += v.pnl;
    peak = Math.max(peak, cum);
    maxDrawdown = Math.max(maxDrawdown, peak - cum);
  }

  const tickers = tickerRows(data);
  const bySymbol = new Map<string, { pnl: number; days: Set<string> }>();
  for (const t of tickers) {
    const e = bySymbol.get(t.symbol) ?? { pnl: 0, days: new Set<string>() };
    e.pnl += t.pnl;
    for (const d of t.days) e.days.add(d);
    bySymbol.set(t.symbol, e);
  }
  const symbolPnl = [...bySymbol.entries()].sort((a, b) => b[1].pnl - a[1].pnl);
  const repeatOffenders = symbolPnl
    .filter(([, e]) => e.pnl < 0 && e.days.size >= 3)
    .map(([symbol, e]) => ({ symbol, pnl: e.pnl, days: e.days.size }));
  const top = symbolPnl[0];
  const bestTicker =
    top && top[1].pnl > 0 ? { symbol: top[0], pnl: top[1].pnl, days: top[1].days.size } : null;

  const denom = net > 0 ? net : 0;
  const topTickerShare = denom && top && top[1].pnl > 0 ? top[1].pnl / denom : 0;
  const topDayShare = denom && bestDay && bestDay[1] > 0 ? bestDay[1] / denom : 0;

  const counts = daily.map(([, v]) => v.trades).sort((a, b) => a - b);
  const medTrades = counts.length ? (counts[Math.floor(counts.length / 2)] ?? 0) : 0;
  let revengeDays = 0;
  for (let i = 1; i < daily.length; i++) {
    const prev = daily[i - 1];
    const cur = daily[i];
    if (prev && cur && prev[1].pnl < 0 && cur[1].trades > medTrades && cur[1].pnl < 0)
      revengeDays++;
  }

  const kindPnl = { call: 0, put: 0, stock: 0 };
  for (const t of closed) kindPnl[instrumentKind(t.label)] += t.pnl;

  const overnightOptions = data.openPositions
    .filter((p) => instrumentKind(p.label) !== "stock")
    .reduce((s, p) => s + Math.abs(p.qty), 0);
  const carriedContracts = closedAll
    .filter((t) => t.carried)
    .reduce((s, t) => s + Math.abs(t.qty), 0);

  const sizes = closed.map(
    (t) => Math.abs(t.qty) * (instrumentKind(t.label) === "stock" ? 1 : 100),
  );
  const sizeMean = avg(sizes);
  const sizeSd = sizes.length ? Math.sqrt(avg(sizes.map((s) => (s - sizeMean) ** 2))) : 0;

  const largestWin = wins.reduce((m, t) => Math.max(m, t.pnl), 0);
  const largestLoss = Math.abs(losses.reduce((m, t) => Math.min(m, t.pnl), 0));

  return {
    net,
    gross,
    fees,
    feeDrag: grossWins > 0 ? fees / grossWins : 0,
    tradeCount: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: decided ? wins.length / decided : 0,
    avgWin,
    avgLoss,
    payoff: avgLoss ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0,
    profitFactor: grossLossAbs ? grossWins / grossLossAbs : grossWins > 0 ? Infinity : 0,
    expectancy: closed.length ? gross / closed.length : 0,
    largestWin,
    largestLoss,
    lossOutlier: avgLoss ? largestLoss / avgLoss : 0,
    tradingDays: daily.length,
    greenDays: greenArr.length,
    dayWinRate: daily.length ? greenArr.length / daily.length : 0,
    bestDay,
    worstDay,
    avgTradesGreenDay: avg(greenArr.map(([, v]) => v.trades)),
    avgTradesRedDay: avg(redArr.map(([, v]) => v.trades)),
    maxDrawdown,
    topDayShare,
    topTickerShare,
    revengeDays,
    overnightOptions,
    carriedContracts,
    callPnl: kindPnl.call,
    putPnl: kindPnl.put,
    stockPnl: kindPnl.stock,
    optionPnl: kindPnl.call + kindPnl.put,
    repeatOffenders,
    bestTicker,
    sizingCV: sizeMean ? sizeSd / sizeMean : 0,
  };
}

export interface Analysis {
  m: Metrics;
  score: number;
  grade: string;
  goods: string[];
  bads: string[];
  watch: string[];
  advice: string[];
  enoughData: boolean;
}

export function analyze(data: Dataset): Analysis {
  const m = metrics(data);
  const goods: string[] = [];
  const bads: string[] = [];
  const watch: string[] = [];
  const advice: string[] = [];
  const enoughData = m.wins + m.losses >= 8;
  const M = fmtMoney;

  // Profit factor — the headline "is there an edge" number.
  if (m.profitFactor >= 2)
    goods.push(
      `Profit factor ${ratio(m.profitFactor)} — you take in about $${
        m.profitFactor === Infinity ? "∞" : m.profitFactor.toFixed(1)
      } for every $1 you give back. That is a genuine edge.`,
    );
  else if (m.profitFactor >= 1.3)
    goods.push(
      `Profit factor ${ratio(m.profitFactor)} — solidly profitable; wins outweigh losses.`,
    );
  else if (m.profitFactor >= 1)
    watch.push(
      `Profit factor ${ratio(m.profitFactor)} — barely above break-even. A little slippage or one bad week flips this negative.`,
    );
  else {
    bads.push(
      `Profit factor ${ratio(m.profitFactor)} — you lose more than you win. Gross ${M(m.gross)} before ${M(-m.fees)} of commissions.`,
    );
    advice.push(
      "Stop adding size. Trade minimum size (or on paper) until profit factor holds above 1.3 over 20+ trades.",
    );
  }

  // Payoff vs win rate — the structure of the edge.
  if (m.payoff >= 1.6)
    goods.push(
      `Winners (${M(m.avgWin)}) are ${
        m.payoff === Infinity ? "far bigger than" : `${m.payoff.toFixed(1)}×`
      } losers (${M(-m.avgLoss)}) — you let trades work and cut the bad ones early.`,
    );
  else if (m.payoff < 1 && m.winRate < 0.5) {
    bads.push(
      `Losers (${M(-m.avgLoss)}) are bigger than winners (${M(m.avgWin)}) and you win only ${pct(
        m.winRate,
      )} of trades — the math is working against you.`,
    );
    advice.push(
      "Fix one side at a time: either hold winners longer (push payoff toward 1.5) or tighten entries (win rate above 55%). Chasing both at once usually fails.",
    );
  } else if (m.payoff < 1)
    watch.push(
      `Winners (${M(m.avgWin)}) are smaller than losers (${M(-m.avgLoss)}); it only works because you win ${pct(
        m.winRate,
      )} of the time. Thin margin for error.`,
    );

  if (m.winRate >= 0.45 && m.winRate <= 0.65 && m.payoff >= 1.3)
    goods.push(
      `${pct(m.winRate)} win rate with a ${m.payoff.toFixed(1)}× payoff is a healthy, repeatable structure.`,
    );
  if (m.winRate > 0.75 && m.payoff < 1)
    watch.push(
      `${pct(
        m.winRate,
      )} win rate looks great, but you hand it back on the losers — one bad trade erases several good ones.`,
    );

  // Expectancy.
  if (m.expectancy > 0)
    goods.push(
      `Every trade is worth ${M(m.expectancy)} on average (gross). Keep the process identical and the equity curve follows.`,
    );
  else bads.push(`Average trade is ${M(m.expectancy)} — the process is negative-sum right now.`);

  // Stop discipline / outlier losses.
  if (m.lossOutlier >= 3 && m.losses >= 4) {
    bads.push(
      `Worst loss (${M(-m.largestLoss)}) was ${m.lossOutlier.toFixed(
        1,
      )}× your average loss — a trade you did not cut.`,
    );
    advice.push(
      `Set a hard stop near your average loss (${M(-m.avgLoss)}). No single trade should be allowed to become a ${M(
        -m.largestLoss,
      )} hole.`,
    );
  } else if (m.lossOutlier > 0 && m.lossOutlier < 2 && m.losses >= 4)
    goods.push(
      `Losses are tightly clustered (worst ${M(-m.largestLoss)} vs ${M(
        -m.avgLoss,
      )} average) — you cut losers consistently.`,
    );

  // Commission drag.
  if (m.feeDrag >= 0.35) {
    bads.push(`Commissions ate ${pct(m.feeDrag)} of your gross winnings (${M(-m.fees)}).`);
    advice.push(
      "Fees that high usually mean too many small trades. Fewer, higher-conviction positions keep more of the edge.",
    );
  } else if (m.feeDrag > 0 && m.feeDrag < 0.15 && m.fees > 0)
    goods.push(
      `Commissions are only ${pct(m.feeDrag)} of gross profit — you are not over-trading into the broker's pocket.`,
    );

  // Concentration of results.
  if (m.bestDay && m.topDayShare >= 0.5) {
    bads.push(
      `${pct(m.topDayShare)} of your net came from one day (${m.bestDay[0]}, ${M(
        m.bestDay[1],
      )}). Remove it and you are at ${M(m.net - m.bestDay[1])}.`,
    );
    advice.push(
      "One day carrying the whole book is variance, not skill. Judge yourself on the other sessions.",
    );
  } else if (m.topTickerShare >= 0.55)
    watch.push(
      `${pct(m.topTickerShare)} of your profit is from a single symbol — great while it lasts, but it is your entire book.`,
    );

  // Drawdown vs net.
  if (m.maxDrawdown > 0 && m.net > 0 && m.maxDrawdown >= m.net * 0.6)
    watch.push(
      `Peak-to-valley drawdown was ${M(-m.maxDrawdown)} against ${M(
        m.net,
      )} net. Size so a normal drawdown does not force you to stop.`,
    );

  // Over-trading.
  if (m.avgTradesRedDay >= m.avgTradesGreenDay * 1.4 && m.avgTradesRedDay >= 3) {
    bads.push(
      `You trade more on losing days (${m.avgTradesRedDay.toFixed(1)} vs ${m.avgTradesGreenDay.toFixed(
        1,
      )} on green days) — forcing trades when the read is wrong.`,
    );
    advice.push("Cap trades per day. Hit the cap in the red and you are done — walk away.");
  }

  // Revenge trading.
  if (m.revengeDays >= 2) {
    bads.push(
      `${m.revengeDays} sessions where you came back hot after a losing day, over-traded, and lost again.`,
    );
    advice.push(
      "After any red day, start the next session at half size until you are green again.",
    );
  }

  // Repeat-offender symbols.
  for (const r of m.repeatOffenders.slice(0, 2)) {
    bads.push(
      `${r.symbol}: ${r.days} sessions, ${M(r.pnl)} net — a name you keep going back to and do not beat.`,
    );
    advice.push(
      `Bench ${r.symbol} for two weeks, or trade it at a third of size and log every setup.`,
    );
  }

  // What's working best.
  if (m.bestTicker && m.bestTicker.days >= 2)
    goods.push(
      `${m.bestTicker.symbol} is your edge: ${M(m.bestTicker.pnl)} across ${
        m.bestTicker.days
      } sessions. Do more of this and less of everything else.`,
    );

  // Directional bias.
  if (m.putPnl < 0 && m.callPnl > 0 && Math.abs(m.putPnl) > Math.abs(m.net) * 0.2)
    watch.push(
      `Calls make money (${M(m.callPnl)}), puts lose it (${M(
        m.putPnl,
      )}). You read strength better than you fade it.`,
    );
  if (m.callPnl < 0 && m.putPnl > 0 && Math.abs(m.callPnl) > Math.abs(m.net) * 0.2)
    watch.push(
      `Puts make money (${M(m.putPnl)}), calls lose it (${M(
        m.callPnl,
      )}). Your short-side instinct is the better one.`,
    );

  if (m.optionPnl < 0 && m.stockPnl > 0)
    watch.push(
      `Options are net ${M(m.optionPnl)} while your stock trades are ${M(
        m.stockPnl,
      )} — the leverage is working against you.`,
    );

  if (m.overnightOptions > 0)
    watch.push(
      `You are holding ${m.overnightOptions} option contract(s) overnight. Theta and gap risk run while you sleep — fine if planned, dangerous if it is a hope.`,
    );

  // Sizing discipline.
  if (m.sizingCV >= 0.7 && m.tradeCount >= 8) {
    bads.push(
      `Position size swings wildly (${pct(
        m.sizingCV,
      )} variation around your average). Inconsistent size makes the results mostly noise.`,
    );
    advice.push(
      "Pick a base size. Vary it in two or three fixed tiers by conviction, never ad hoc.",
    );
  } else if (m.sizingCV > 0 && m.sizingCV < 0.35 && m.tradeCount >= 8)
    goods.push("Position sizing is consistent — that is what makes a track record mean something.");

  // Day-level consistency.
  if (m.dayWinRate >= 0.55) goods.push(`${pct(m.dayWinRate)} of your trading days finish green.`);
  else if (m.dayWinRate < 0.4 && m.tradingDays >= 5)
    watch.push(
      `Only ${pct(m.dayWinRate)} of days finish green — you lean on a few big ones. Read that next to the concentration note.`,
    );

  if (m.carriedContracts > 0)
    watch.push(
      `${m.carriedContracts} contracts/shares were carried in from before your statements — P&L on those is incomplete, so treat the totals as a floor.`,
    );

  // Score.
  let score = 50;
  const pf = m.profitFactor === Infinity ? 3 : m.profitFactor;
  score += pf >= 2 ? 20 : pf >= 1.5 ? 14 : pf >= 1.2 ? 7 : pf >= 1 ? 0 : pf >= 0.7 ? -18 : -30;
  const po = m.payoff === Infinity ? 3 : m.payoff;
  score += po >= 2 ? 10 : po >= 1.5 ? 6 : po >= 1 ? 2 : po >= 0.6 ? -8 : -14;
  score += m.winRate >= 0.35 && m.winRate <= 0.7 ? 4 : m.winRate < 0.3 ? -6 : 0;
  score += m.expectancy > 0 ? 6 : -12;
  score += m.topDayShare >= 0.6 ? -12 : m.topDayShare >= 0.4 ? -6 : 0;
  score += m.topTickerShare >= 0.6 ? -6 : 0;
  score += m.feeDrag >= 0.4 ? -8 : m.feeDrag >= 0.25 ? -4 : 0;
  score += m.lossOutlier >= 3 ? -6 : 0;
  score += m.avgTradesRedDay >= m.avgTradesGreenDay * 1.4 && m.avgTradesRedDay >= 3 ? -5 : 0;
  score += m.revengeDays >= 2 ? -6 : 0;
  score += m.repeatOffenders.length ? -4 : 0;
  score += m.sizingCV >= 0.7 ? -5 : m.sizingCV > 0 && m.sizingCV < 0.35 ? 3 : 0;
  score = Math.max(3, Math.min(97, Math.round(score)));
  const grade =
    score >= 88
      ? "A"
      : score >= 80
        ? "A−"
        : score >= 73
          ? "B"
          : score >= 66
            ? "B−"
            : score >= 58
              ? "C"
              : score >= 50
                ? "C−"
                : score >= 42
                  ? "D"
                  : "F";

  if (!advice.length)
    advice.push("Nothing urgent to fix. Keep the process identical and let the sample grow.");

  return { m, score, grade, goods, bads, watch, advice, enoughData };
}

export function journal(data: Dataset): Post[] {
  const closed = data.closed.filter((t) => !t.carried);
  if (closed.length === 0) return [];

  const a = analyze(data);
  const posts: Post[] = [];
  const lastDate = data.fills[data.fills.length - 1]?.date ?? new Date().toISOString().slice(0, 10);

  const review: Post = {
    id: "review",
    date: lastDate,
    title: a.enoughData ? "Coach's review" : "Early read — small sample",
    grade: a.grade,
    score: a.score,
    summary: `${fmtMoney(a.m.net)} net across ${a.m.tradeCount} trades and ${
      a.m.tradingDays
    } sessions. Win rate ${pct(a.m.winRate)}, payoff ${ratio(a.m.payoff)}×, profit factor ${ratio(
      a.m.profitFactor,
    )}.`,
    sections: [],
  };
  if (!a.enoughData)
    review.sections.push({
      heading: "Caveat",
      tone: "neutral",
      items: [
        `Only ${a.m.wins + a.m.losses} decided trades so far. Everything below is directional, not conclusive — import more history for a real read.`,
      ],
    });
  if (a.goods.length)
    review.sections.push({ heading: "What you're doing right", tone: "good", items: a.goods });
  if (a.bads.length)
    review.sections.push({ heading: "What's costing you", tone: "bad", items: a.bads });
  if (a.watch.length) review.sections.push({ heading: "Watch", tone: "neutral", items: a.watch });
  if (a.advice.length)
    review.sections.push({ heading: "Do this next", tone: "neutral", items: a.advice });
  posts.push(review);

  const daily = [...dailyTotals(data).entries()];
  const months = [...new Set(daily.map(([d]) => d.slice(0, 7)))].sort().reverse();
  for (const mk of months) {
    const rows = daily.filter(([d]) => d.startsWith(mk));
    const mNet = rows.reduce((s, [, v]) => s + v.pnl, 0);
    const green = rows.filter(([, v]) => v.pnl > 0).length;
    const best = rows.reduce<[string, number] | null>(
      (b, [d, v]) => (!b || v.pnl > b[1] ? [d, v.pnl] : b),
      null,
    );
    const worst = rows.reduce<[string, number] | null>(
      (b, [d, v]) => (!b || v.pnl < b[1] ? [d, v.pnl] : b),
      null,
    );
    const label = new Date(`${mk}-01T00:00`).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    const items: string[] = [
      `${fmtMoney(mNet)} net over ${rows.length} sessions, ${green} green (${pct(
        rows.length ? green / rows.length : 0,
      )}).`,
    ];
    if (best)
      items.push(
        `Best day ${best[0]} ${fmtMoney(best[1])}${
          worst && worst[0] !== best[0] ? `, worst ${worst[0]} ${fmtMoney(worst[1])}` : ""
        }.`,
      );
    const monthClosed = data.closed.filter((t) => !t.carried && t.date.startsWith(mk));
    const bySym = new Map<string, number>();
    for (const t of monthClosed) bySym.set(t.symbol, (bySym.get(t.symbol) ?? 0) + t.pnl);
    const ranked = [...bySym.entries()].sort((x, y) => y[1] - x[1]);
    const leader = ranked[0];
    const laggard = ranked[ranked.length - 1];
    if (leader && leader[1] > 0)
      items.push(`${leader[0]} carried the month (${fmtMoney(leader[1])}).`);
    if (laggard && laggard[1] < 0 && (!leader || laggard[0] !== leader[0]))
      items.push(`${laggard[0]} was the drag (${fmtMoney(laggard[1])}).`);

    posts.push({
      id: `month-${mk}`,
      date: [...rows.map(([d]) => d)].sort().reverse()[0] ?? `${mk}-28`,
      title: label,
      summary: `${fmtMoney(mNet)} · ${rows.length} sessions`,
      sections: [
        { heading: "Notes", tone: mNet > 0 ? "good" : mNet < 0 ? "bad" : "neutral", items },
      ],
    });
  }

  posts.push({
    id: "numbers",
    date: lastDate,
    title: "By the numbers",
    summary:
      "The full stat line behind the review. Trade figures are gross; commissions shown separately.",
    sections: [
      {
        heading: "Imported history",
        tone: "neutral",
        items: [
          `Net ${fmtMoney(a.m.net)} · gross ${fmtMoney(a.m.gross)} · commissions ${fmtMoney(-a.m.fees)}`,
          `Trades ${a.m.tradeCount} · ${a.m.wins}W / ${a.m.losses}L · win rate ${pct(a.m.winRate)}`,
          `Avg win ${fmtMoney(a.m.avgWin)} · avg loss ${fmtMoney(-a.m.avgLoss)} · payoff ${ratio(
            a.m.payoff,
          )}×`,
          `Profit factor ${ratio(a.m.profitFactor)} · expectancy ${fmtMoney(a.m.expectancy)}/trade`,
          `Largest win ${fmtMoney(a.m.largestWin)} · largest loss ${fmtMoney(-a.m.largestLoss)}`,
          `Sessions ${a.m.tradingDays} · green ${pct(a.m.dayWinRate)} · best ${
            a.m.bestDay ? fmtMoney(a.m.bestDay[1]) : "—"
          } · worst ${a.m.worstDay ? fmtMoney(a.m.worstDay[1]) : "—"}`,
          `Max drawdown ${fmtMoney(-a.m.maxDrawdown)} · commissions ${pct(a.m.feeDrag)} of gross wins`,
          `Stock ${fmtMoney(a.m.stockPnl)} · calls ${fmtMoney(a.m.callPnl)} · puts ${fmtMoney(a.m.putPnl)}`,
        ],
      },
    ],
  });

  return posts;
}
