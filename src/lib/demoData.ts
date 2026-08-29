import { buildDataset, DEFAULT_COMMISSIONS, type Dataset, type Fill } from "@/lib/pnl";

/**
 * A deterministic, self-contained sample dataset so a first-time visitor can
 * explore the calendar without a broker export. Built straight as `Fill[]` and
 * run through the real `buildDataset` pipeline (FIFO matching, fees, open
 * positions) — the same code path a parsed CSV takes.
 */

type Leg = {
  day: string; // yyyy-mm-dd
  symbol: string;
  label: string; // instrument identity; equals symbol for stock
  qty: number; // signed: + buy, - sell
  price: number;
  option?: boolean;
  effect?: "open" | "close";
  fee?: number;
};

// Two months of activity ending "recently". Mix of winners, losers, stock and
// options, a couple of positions left open, and one multi-day hold.
const LEGS: Leg[] = [
  // ---- Month A ----
  { day: "-1-05", symbol: "QQQ", label: "QQQ", qty: 100, price: 505.2 },
  { day: "-1-05", symbol: "QQQ", label: "QQQ", qty: -100, price: 508.1 },
  {
    day: "-1-06",
    symbol: "AAPL",
    label: "AAPL 240 CALL",
    qty: 5,
    price: 3.1,
    option: true,
    effect: "open",
  },
  {
    day: "-1-06",
    symbol: "AAPL",
    label: "AAPL 240 CALL",
    qty: -5,
    price: 2.35,
    option: true,
    effect: "close",
  },
  { day: "-1-08", symbol: "NVDA", label: "NVDA", qty: 40, price: 118.4 },
  { day: "-1-08", symbol: "NVDA", label: "NVDA", qty: -40, price: 121.9 },
  {
    day: "-1-12",
    symbol: "SPY",
    label: "SPY 560 PUT",
    qty: 8,
    price: 2.4,
    option: true,
    effect: "open",
  },
  {
    day: "-1-13",
    symbol: "SPY",
    label: "SPY 560 PUT",
    qty: -8,
    price: 3.15,
    option: true,
    effect: "close",
  },
  { day: "-1-14", symbol: "TSLA", label: "TSLA", qty: 25, price: 242.0 },
  { day: "-1-14", symbol: "TSLA", label: "TSLA", qty: -25, price: 236.5 },
  {
    day: "-1-19",
    symbol: "QQQ",
    label: "QQQ 510 CALL",
    qty: 10,
    price: 1.8,
    option: true,
    effect: "open",
  },
  {
    day: "-1-19",
    symbol: "QQQ",
    label: "QQQ 510 CALL",
    qty: -10,
    price: 2.55,
    option: true,
    effect: "close",
  },
  { day: "-1-20", symbol: "AAPL", label: "AAPL", qty: 60, price: 228.9 },
  { day: "-1-21", symbol: "AAPL", label: "AAPL", qty: -60, price: 231.4 },
  {
    day: "-1-26",
    symbol: "NVDA",
    label: "NVDA 120 CALL",
    qty: 6,
    price: 4.2,
    option: true,
    effect: "open",
  },
  {
    day: "-1-26",
    symbol: "NVDA",
    label: "NVDA 120 CALL",
    qty: -6,
    price: 3.05,
    option: true,
    effect: "close",
  },
  { day: "-1-27", symbol: "SPY", label: "SPY", qty: 50, price: 566.7 },
  { day: "-1-27", symbol: "SPY", label: "SPY", qty: -50, price: 569.2 },

  // ---- Month B ----
  { day: "-2-02", symbol: "QQQ", label: "QQQ", qty: 120, price: 511.0 },
  { day: "-2-02", symbol: "QQQ", label: "QQQ", qty: -120, price: 514.8 },
  {
    day: "-2-03",
    symbol: "TSLA",
    label: "TSLA 250 CALL",
    qty: 4,
    price: 5.6,
    option: true,
    effect: "open",
  },
  {
    day: "-2-04",
    symbol: "TSLA",
    label: "TSLA 250 CALL",
    qty: -4,
    price: 7.9,
    option: true,
    effect: "close",
  },
  {
    day: "-2-05",
    symbol: "AAPL",
    label: "AAPL 235 PUT",
    qty: 7,
    price: 2.9,
    option: true,
    effect: "open",
  },
  {
    day: "-2-05",
    symbol: "AAPL",
    label: "AAPL 235 PUT",
    qty: -7,
    price: 2.1,
    option: true,
    effect: "close",
  },
  { day: "-2-09", symbol: "NVDA", label: "NVDA", qty: 30, price: 124.6 },
  { day: "-2-10", symbol: "NVDA", label: "NVDA", qty: -30, price: 129.3 },
  {
    day: "-2-11",
    symbol: "SPY",
    label: "SPY 570 CALL",
    qty: 9,
    price: 3.3,
    option: true,
    effect: "open",
  },
  {
    day: "-2-11",
    symbol: "SPY",
    label: "SPY 570 CALL",
    qty: -9,
    price: 2.55,
    option: true,
    effect: "close",
  },
  { day: "-2-12", symbol: "QQQ", label: "QQQ", qty: 80, price: 516.4 },
  { day: "-2-12", symbol: "QQQ", label: "QQQ", qty: -80, price: 519.0 },
  { day: "-2-16", symbol: "TSLA", label: "TSLA", qty: 20, price: 231.0 },
  { day: "-2-17", symbol: "TSLA", label: "TSLA", qty: -20, price: 228.2 },
  {
    day: "-2-18",
    symbol: "AAPL",
    label: "AAPL 245 CALL",
    qty: 6,
    price: 2.7,
    option: true,
    effect: "open",
  },
  {
    day: "-2-18",
    symbol: "AAPL",
    label: "AAPL 245 CALL",
    qty: -6,
    price: 3.85,
    option: true,
    effect: "close",
  },
  {
    day: "-2-19",
    symbol: "NVDA",
    label: "NVDA 130 CALL",
    qty: 5,
    price: 3.9,
    option: true,
    effect: "open",
  },
  {
    day: "-2-20",
    symbol: "NVDA",
    label: "NVDA 130 CALL",
    qty: -5,
    price: 5.4,
    option: true,
    effect: "close",
  },

  // Still open at the end of the sample
  {
    day: "-2-23",
    symbol: "QQQ",
    label: "QQQ 520 CALL",
    qty: 8,
    price: 2.2,
    option: true,
    effect: "open",
  },
  { day: "-2-24", symbol: "SPY", label: "SPY", qty: 40, price: 571.5 },
];

function monthOffsets(): { a: string; b: string } {
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), 1);
  const a = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { a: fmt(a), b: fmt(b) };
}

export function demoDataset(): Dataset {
  const { a, b } = monthOffsets();
  const fills: Fill[] = LEGS.map((leg, i) => {
    const date = (leg.day.startsWith("-1") ? a : b) + leg.day.slice(2);
    const [y, mo, d] = date.split("-").map(Number);
    return {
      ts: Date.UTC(y!, mo! - 1, d!) / 1000 + 34_200 + i * 90, // ~09:30 + ordering
      date,
      symbol: leg.symbol,
      label: leg.label,
      key: leg.label,
      qty: leg.qty,
      price: leg.price,
      multiplier: leg.option ? 100 : 1,
      pnl: 0,
      hasPnlColumn: false,
      csvFee: leg.fee ?? (leg.option ? Math.abs(leg.qty) * 0.65 : 0),
      posEffect: leg.effect ?? "",
      source: "demo-data",
    };
  });
  return buildDataset(fills, ["Demo data.csv"], new Map(), DEFAULT_COMMISSIONS);
}

export const DEMO_FILE_NAME = "Demo data.csv";
