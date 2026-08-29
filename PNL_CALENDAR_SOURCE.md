# PnL Calendar — Full Source Bundle

Generated from the live project. Each section is one file, verbatim.


---

## `src/lib/pnl.ts`

```ts
import Papa from "papaparse";

export type Fill = {
  ts: number; // sortable timestamp
  date: string; // yyyy-mm-dd
  symbol: string; // underlying, e.g. QQQ
  label: string; // instrument, e.g. "QQQ 27-Aug-26 712 CALL"
  key: string; // instrument identity
  qty: number; // signed: + buy, - sell
  price: number;
  multiplier: number;
  pnl: number; // only when the file provides a P/L column
  hasPnlColumn: boolean;
  csvFee: number; // commissions + fees reported by the broker for this fill (cost, >= 0)
  posEffect: "open" | "close" | "";
  source: string;
};

export type ClosedTrade = {
  date: string;
  symbol: string;
  label: string;
  key: string;
  qty: number;
  pnl: number;
  /** Position was opened before this statement; cost basis not in the file. */
  carried: boolean;
};

export type OpenPosition = {
  symbol: string;
  label: string;
  key: string;
  qty: number;
  avgPrice: number;
  openedOn: string;
};

export type InstrumentKind = "call" | "put" | "stock";

export type DaySymbolRow = {
  label: string;
  symbol: string;
  key: string;
  qty: number; // contracts/shares closed on the day
  kind: InstrumentKind;
  pnl: number; // net of commissions
  grossPnl: number;
  fees: number;
  status: "closed" | "open" | "partial" | "carried-out";
  openQty: number;
  avgOpenPrice: number;
  carriedQty: number; // closed today but opened before this statement
  openedQty: number; // contracts/shares opened on this day
  avgEntry: number; // average entry price of the fills opened this day
  avgExit: number; // average exit price of the fills closed this day
  fills: number; // number of executions on this day
};


export function instrumentKind(label: string): InstrumentKind {
  const u = label.toUpperCase();
  if (/\bCALL\b/.test(u)) return "call";
  if (/\bPUT\b/.test(u)) return "put";
  return "stock";
}


export type Dataset = {
  fills: Fill[];
  closed: ClosedTrade[];
  openPositions: OpenPosition[];
  /** Broker-reported realized P/L for a day, keyed date -> underlying -> pnl. */
  officialDayPnl: Map<string, Map<string, number>>;
  files: string[];
  commissions: CommissionSettings;
  /** Total commission cost per day. */
  feesByDate: Map<string, number>;
  /** Total commission cost per instrument key. */
  feesByKey: Map<string, number>;
  totalFees: number;
};

export type ParsedFile = {
  fills: Fill[];
  officialDayPnl: Map<string, Map<string, number>>;
};

const DATE_KEYS = /(exec.*(time|date)|trade.*date|date\/time|^date$|date|time)/i;
const SYMBOL_KEYS = /(symbol|ticker|underlying|instrument|security)/i;
const QTY_KEYS = /(qty|quantity|shares|contracts|^amount$|size)/i;
const SIDE_KEYS = /(side|action|b\/s|buy\/sell)/i;
const PRICE_KEYS = /(trade price|avg price|fill price|^price$|price)/i;
const PNL_KEYS = /(p\/?\s?l|pnl|profit|gain|realized)/i;
const EXP_KEYS = /^exp/i;
const STRIKE_KEYS = /^strike/i;
const TYPE_KEYS = /^type$/i;
const COMM_KEYS = /^(commissions?|comm)\b/i;
const FEES_KEYS = /(misc\s*fees|reg\s*fees|exchange\s*fees|^fees?$)/i;

export type CommissionSettings = {
  /** Fallback per-contract commission when the statement has no fee columns. */
  perContract: number;
  /** Fallback per-share commission when the statement has no fee columns. */
  perShare: number;
  /** Flat fee charged per execution. */
  perTrade: number;
};

export const DEFAULT_COMMISSIONS: CommissionSettings = {
  perContract: 0.65,
  perShare: 0,
  perTrade: 0,
};

/** Effective commission cost (positive) for one fill. */
export function fillFee(f: Fill, c: CommissionSettings): number {
  if (f.csvFee > 0) return f.csvFee;
  const q = Math.abs(f.qty);
  const rate = f.multiplier > 1 ? c.perContract : c.perShare;
  return q * rate + c.perTrade;
}

function num(raw: unknown): number {
  if (raw == null) return 0;
  let s = String(raw).trim();
  if (!s) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, "");
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  const v = Number.parseFloat(s);
  if (Number.isNaN(v)) return 0;
  return neg ? -v : v;
}

const MONTHS = "janfebmaraprmayjunjulaugsepoctnovdec";

function parseDateTime(raw: unknown): { date: string; ts: number } | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  let date: string | null = null;

  let m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) date = `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  if (!date) {
    m = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
    if (m) {
      const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
      date = `${y}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
    }
  }
  if (!date) {
    m = s.match(/(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{2,4})/);
    if (m) {
      const mi = MONTHS.indexOf(m[2]!.toLowerCase()) / 3;
      if (mi >= 0 && Number.isInteger(mi)) {
        const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
        date = `${y}-${String(mi + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
      }
    }
  }
  if (!date) return null;

  const t = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const mins = t ? Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3] ?? 0) : 0;
  const [y, mo, d] = date.split("-").map(Number);
  return { date, ts: Date.UTC(y!, mo! - 1, d!) / 1000 + mins };
}

function pick(headers: string[], re: RegExp): number {
  for (let i = 0; i < headers.length; i++) if (headers[i] && re.test(headers[i]!)) return i;
  return -1;
}

function headerScore(cells: string[]): number {
  let score = 0;
  for (const c of cells) {
    if (DATE_KEYS.test(c)) score += 2;
    if (SYMBOL_KEYS.test(c)) score += 2;
    if (QTY_KEYS.test(c)) score += 1;
    if (PNL_KEYS.test(c)) score += 2;
    if (PRICE_KEYS.test(c)) score += 1;
  }
  return score;
}

/** Split a multi-section statement into blocks, each with its own header row. */
function sections(rows: string[][]): { title: string; header: string[]; body: string[][] }[] {
  const out: { title: string; header: string[]; body: string[][] }[] = [];
  let current: { title: string; header: string[]; body: string[][] } | null = null;
  let lastTitle = "";
  for (const row of rows) {
    const cells = row.map((c) => String(c ?? "").trim());
    const nonEmpty = cells.filter(Boolean);
    if (nonEmpty.length >= 3 && headerScore(nonEmpty) >= 4) {
      current = { title: lastTitle, header: cells, body: [] };
      out.push(current);
      continue;
    }
    if (nonEmpty.length === 1) {
      lastTitle = nonEmpty[0]!;
      current = null;
      continue;
    }
    if (current && nonEmpty.length) current.body.push(cells);
  }
  return out;
}

function cleanSymbol(raw: string): string {
  const s = raw.trim().replace(/^"|"$/g, "");
  const m = s.match(/^[A-Z./]{1,8}\b/);
  return (m ? m[0] : (s.split(/\s+/)[0] ?? s)).toUpperCase();
}

const STATUS_KEYS = /^status$/i;
const POS_EFFECT_KEYS = /pos\s*effect/i;
const PL_DAY_KEYS = /p\/l\s*day/i;

/** Order-history style blocks list unfilled orders; never treat them as fills. */
function isOrderHistory(title: string, header: string[]): boolean {
  return /order history/i.test(title) || header.some((h) => STATUS_KEYS.test(h));
}

export function parseStatement(text: string, fileName: string): ParsedFile {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = (parsed.data as string[][]).filter(Array.isArray);
  const fills: Fill[] = [];
  const officialDayPnl = new Map<string, Map<string, number>>();

  const blocks = sections(rows);
  const tradeBlocks = blocks.filter((b) => /trade history/i.test(b.title));
  const fillBlocks = (tradeBlocks.length ? tradeBlocks : blocks).filter(
    (b) => !isOrderHistory(b.title, b.header),
  );

  for (const { header, body } of fillBlocks) {
    const iDate = pick(header, DATE_KEYS);
    const iSym = pick(header, SYMBOL_KEYS);
    const iQty = pick(header, QTY_KEYS);
    const iSide = pick(header, SIDE_KEYS);
    const iPrice = pick(header, PRICE_KEYS);
    const iPnl = pick(header, PNL_KEYS);
    const iExp = pick(header, EXP_KEYS);
    const iStrike = pick(header, STRIKE_KEYS);
    const iType = pick(header, TYPE_KEYS);
    const iEffect = pick(header, POS_EFFECT_KEYS);
    const iComm = pick(header, COMM_KEYS);
    const iFees = pick(header, FEES_KEYS);
    if (iDate < 0 || iSym < 0) continue;

    for (const row of body) {
      const when = parseDateTime(row[iDate]);
      const symRaw = String(row[iSym] ?? "").trim();
      if (!when || !symRaw) continue;
      const symbol = cleanSymbol(symRaw);
      if (!symbol || /^(total|cash|balance|subtotal)/i.test(symbol)) continue;

      let qty = iQty >= 0 ? num(row[iQty]) : 0;
      const side = iSide >= 0 ? String(row[iSide] ?? "") : "";
      if (/sell|sld|sto|stc|short/i.test(side) && qty > 0) qty = -qty;
      if (/\bbuy|bot|bto|btc/i.test(side) && qty < 0) qty = -qty;
      if (!qty) continue;

      const type = iType >= 0 ? String(row[iType] ?? "").trim().toUpperCase() : "";
      const exp = iExp >= 0 ? String(row[iExp] ?? "").trim() : "";
      const strike = iStrike >= 0 ? String(row[iStrike] ?? "").trim() : "";
      const isOption = type === "PUT" || type === "CALL";
      const label = isOption ? [symbol, exp, strike, type].filter(Boolean).join(" ") : symbol;
      const effectRaw = iEffect >= 0 ? String(row[iEffect] ?? "").toUpperCase() : "";
      const posEffect: Fill["posEffect"] = /TO OPEN/.test(effectRaw)
        ? "open"
        : /TO CLOSE/.test(effectRaw)
          ? "close"
          : "";

      fills.push({
        ts: when.ts,
        date: when.date,
        symbol,
        label,
        key: label,
        qty,
        price: iPrice >= 0 ? num(row[iPrice]) : 0,
        multiplier: isOption ? 100 : 1,
        pnl: iPnl >= 0 ? num(row[iPnl]) : 0,
        hasPnlColumn: iPnl >= 0,
        csvFee:
          Math.abs(iComm >= 0 ? num(row[iComm]) : 0) + Math.abs(iFees >= 0 ? num(row[iFees]) : 0),
        posEffect,
        source: fileName,
      });
    }
  }

  // Broker-reported "Profits and Losses" block: authoritative daily realized P/L.
  const statementDate = fills.map((f) => f.date).sort().pop();
  const plBlock = blocks.find(
    (b) => /profits and losses/i.test(b.title) && b.header.some((h) => PL_DAY_KEYS.test(h)),
  );
  if (plBlock && statementDate) {
    const iSym = pick(plBlock.header, SYMBOL_KEYS);
    const iDay = pick(plBlock.header, PL_DAY_KEYS);
    if (iSym >= 0 && iDay >= 0) {
      const bySymbol = new Map<string, number>();
      for (const row of plBlock.body) {
        const sym = cleanSymbol(String(row[iSym] ?? ""));
        if (!sym || /^(overall|total)/i.test(sym)) continue;
        bySymbol.set(sym, num(row[iDay]));
      }
      if (bySymbol.size) officialDayPnl.set(statementDate, bySymbol);
    }
  }

  return { fills, officialDayPnl };
}

/** Back-compat helper: fills only. */
export function parseCsvText(text: string, fileName: string): Fill[] {
  return parseStatement(text, fileName).fills;
}

type Lot = { qty: number; price: number; date: string; fromClose: boolean };

export function buildDataset(
  fills: Fill[],
  files: string[],
  officialDayPnl: Map<string, Map<string, number>> = new Map(),
  commissions: CommissionSettings = DEFAULT_COMMISSIONS,
): Dataset {
  const sorted = [...fills].sort((a, b) => a.ts - b.ts);
  const closed: ClosedTrade[] = [];
  const openPositions: OpenPosition[] = [];

  const byKey = new Map<string, Fill[]>();
  for (const f of sorted) {
    const list = byKey.get(f.key) ?? [];
    list.push(f);
    byKey.set(f.key, list);
  }

  for (const [key, list] of byKey) {
    const lots: Lot[] = [];
    for (const f of list) {
      let remaining = f.qty;
      while (remaining !== 0 && lots.length && Math.sign(lots[0]!.qty) !== Math.sign(remaining)) {
        const lot = lots[0]!;
        const matched = Math.min(Math.abs(lot.qty), Math.abs(remaining));
        const direction = lot.qty > 0 ? 1 : -1;
        const pnl = (f.price - lot.price) * matched * f.multiplier * direction;
        const explicit = f.hasPnlColumn ? f.pnl * (matched / Math.abs(f.qty)) : pnl;
        closed.push({
          date: f.date,
          symbol: f.symbol,
          label: f.label,
          key,
          qty: matched,
          pnl: explicit,
          carried: false,
        });
        lot.qty -= direction * matched;
        remaining += direction * matched;
        if (Math.abs(lot.qty) < 1e-9) lots.shift();
      }
      if (remaining !== 0) {
        lots.push({
          qty: remaining,
          price: f.price,
          date: f.date,
          fromClose: f.posEffect === "close",
        });
      }
    }

    // Residual lots that came from "TO CLOSE" fills were opened before this
    // statement: no cost basis in the file, so they are closes, not new positions.
    const residualOpen = lots.filter((l) => !l.fromClose);
    for (const lot of lots.filter((l) => l.fromClose)) {
      closed.push({
        date: lot.date,
        symbol: list[0]!.symbol,
        label: list[0]!.label,
        key,
        qty: Math.abs(lot.qty),
        pnl: 0,
        carried: true,
      });
    }

    const net = residualOpen.reduce((s, l) => s + l.qty, 0);
    if (Math.abs(net) > 1e-9) {
      const shares = residualOpen.reduce((s, l) => s + Math.abs(l.qty), 0);
      const cost = residualOpen.reduce((s, l) => s + Math.abs(l.qty) * l.price, 0);
      openPositions.push({
        symbol: list[0]!.symbol,
        label: list[0]!.label,
        key,
        qty: net,
        avgPrice: shares ? cost / shares : 0,
        openedOn: residualOpen[0]?.date ?? list[0]!.date,
      });
    }
  }

  closed.sort((a, b) => a.date.localeCompare(b.date));

  const feesByDate = new Map<string, number>();
  const feesByKey = new Map<string, number>();
  let totalFees = 0;
  for (const f of sorted) {
    const fee = fillFee(f, commissions);
    if (!fee) continue;
    totalFees += fee;
    feesByDate.set(f.date, (feesByDate.get(f.date) ?? 0) + fee);
    feesByKey.set(f.key, (feesByKey.get(f.key) ?? 0) + fee);
  }

  return {
    fills: sorted,
    closed,
    openPositions,
    officialDayPnl,
    files,
    commissions,
    feesByDate,
    feesByKey,
    totalFees,
  };
}

export type TickerRow = {
  key: string;
  label: string;
  symbol: string;
  kind: InstrumentKind;
  pnl: number; // net of commissions
  grossPnl: number;
  fees: number;
  qty: number;
  carriedQty: number;
  wins: number;
  losses: number;
  days: string[];
  openQty: number;
  avgOpenPrice: number;
};

/** Per-instrument realized P/L across the whole dataset. */
export function tickerRows(data: Dataset): TickerRow[] {
  const openMap = new Map(data.openPositions.map((p) => [p.key, p]));
  const map = new Map<string, TickerRow>();
  const ensure = (key: string, label: string, symbol: string) => {
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        label,
        symbol,
        kind: instrumentKind(label),
        pnl: 0,
        grossPnl: 0,
        fees: 0,
        qty: 0,
        carriedQty: 0,
        wins: 0,
        losses: 0,
        days: [],
        openQty: 0,
        avgOpenPrice: 0,
      };
      map.set(key, row);
    }
    return row;
  };

  for (const f of data.fills) ensure(f.key, f.label, f.symbol);
  for (const t of data.closed) {
    const row = ensure(t.key, t.label, t.symbol);
    row.grossPnl += t.pnl;
    row.qty += Math.abs(t.qty);
    if (t.carried) row.carriedQty += Math.abs(t.qty);
    if (t.pnl > 0) row.wins += 1;
    else if (t.pnl < 0) row.losses += 1;
    if (!row.days.includes(t.date)) row.days.push(t.date);
  }
  for (const row of map.values()) {
    const open = openMap.get(row.key);
    row.openQty = open?.qty ?? 0;
    row.avgOpenPrice = open?.avgPrice ?? 0;
    row.fees = data.feesByKey.get(row.key) ?? 0;
    row.pnl = row.grossPnl - row.fees;
  }
  return [...map.values()].sort((a, b) => b.pnl - a.pnl);
}

export type SymbolGroup = {
  symbol: string;
  pnl: number;
  fees: number;
  rows: TickerRow[];
  openQty: number;
};

export function symbolGroups(data: Dataset): SymbolGroup[] {
  const groups = new Map<string, SymbolGroup>();
  for (const r of tickerRows(data)) {
    const g = groups.get(r.symbol) ?? { symbol: r.symbol, pnl: 0, fees: 0, rows: [], openQty: 0 };
    g.pnl += r.pnl;
    g.fees += r.fees;
    g.openQty += Math.abs(r.openQty);
    g.rows.push(r);
    groups.set(r.symbol, g);
  }
  return [...groups.values()].sort((a, b) => b.pnl - a.pnl);
}

export function dayRows(data: Dataset, date: string): DaySymbolRow[] {
  const openMap = new Map(data.openPositions.map((p) => [p.key, p]));
  const official = data.officialDayPnl.get(date);
  const map = new Map<string, DaySymbolRow>();

  const ensure = (key: string, label: string, symbol: string): DaySymbolRow => {
    const existing = map.get(key);
    if (existing) return existing;
    const row: DaySymbolRow = {
      key,
      label,
      symbol,
      qty: 0,
      kind: instrumentKind(label),
      pnl: 0,
      grossPnl: 0,
      fees: 0,
      status: "closed",
      openQty: 0,
      avgOpenPrice: 0,
      carriedQty: 0,
      openedQty: 0,
      avgEntry: 0,
      avgExit: 0,
      fills: 0,
    };
    map.set(key, row);
    return row;
  };

  const entryNotional = new Map<string, number>();
  const entryQty = new Map<string, number>();
  const exitNotional = new Map<string, number>();
  const exitQty = new Map<string, number>();

  for (const f of data.fills) {
    if (f.date !== date) continue;
    const row = ensure(f.key, f.label, f.symbol);
    row.fills += 1;
    row.fees += fillFee(f, data.commissions);
    const q = Math.abs(f.qty);
    const opening = f.posEffect === "open" || (f.posEffect === "" && f.qty > 0);
    if (opening) {
      row.openedQty += q;
      entryQty.set(f.key, (entryQty.get(f.key) ?? 0) + q);
      entryNotional.set(f.key, (entryNotional.get(f.key) ?? 0) + q * f.price);
    } else {
      exitQty.set(f.key, (exitQty.get(f.key) ?? 0) + q);
      exitNotional.set(f.key, (exitNotional.get(f.key) ?? 0) + q * f.price);
    }
  }
  for (const t of data.closed) {
    if (t.date !== date) continue;
    const row = ensure(t.key, t.label, t.symbol);
    row.grossPnl += t.pnl;
    row.qty += Math.abs(t.qty);
    if (t.carried) row.carriedQty += Math.abs(t.qty);
  }

  for (const row of map.values()) {
    const open = openMap.get(row.key);
    row.openQty = open?.qty ?? 0;
    row.avgOpenPrice = open?.avgPrice ?? 0;
    const eq = entryQty.get(row.key) ?? 0;
    const xq = exitQty.get(row.key) ?? 0;
    row.avgEntry = eq ? (entryNotional.get(row.key) ?? 0) / eq : 0;
    row.avgExit = xq ? (exitNotional.get(row.key) ?? 0) / xq : 0;
    row.status = open
      ? row.qty > 0
        ? "partial"
        : "open"
      : row.qty === 0 && row.openedQty > 0
        ? "carried-out" // opened today, closed on a later day
        : "closed";
  }


  const rows = [...map.values()];

  // When some closes were carried in, trust the broker's per-symbol day P/L and
  // assign the unexplained remainder to the carried rows of that symbol.
  if (official) {
    const bySymbol = new Map<string, DaySymbolRow[]>();
    for (const r of rows) bySymbol.set(r.symbol, [...(bySymbol.get(r.symbol) ?? []), r]);
    for (const [symbol, list] of bySymbol) {
      const target = official.get(symbol);
      if (target == null) continue;
      const carriedRows = list.filter((r) => r.carriedQty > 0);
      if (!carriedRows.length) continue;
      const known = list.filter((r) => r.carriedQty === 0).reduce((s, r) => s + r.grossPnl, 0);
      const remainder = target - known;
      const totalCarried = carriedRows.reduce((s, r) => s + r.carriedQty, 0);
      for (const r of carriedRows) r.grossPnl = (remainder * r.carriedQty) / totalCarried;
    }
  }

  for (const r of rows) r.pnl = r.grossPnl - r.fees;

  return rows.sort((a, b) => b.pnl - a.pnl);
}

export function dailyTotals(
  data: Dataset,
): Map<string, { pnl: number; grossPnl: number; fees: number; trades: number }> {
  const m = new Map<string, { pnl: number; grossPnl: number; fees: number; trades: number }>();
  const ensure = (date: string) => {
    const cur = m.get(date) ?? { pnl: 0, grossPnl: 0, fees: 0, trades: 0 };
    m.set(date, cur);
    return cur;
  };
  for (const t of data.closed) {
    const cur = ensure(t.date);
    cur.grossPnl += t.pnl;
    cur.trades += 1;
  }
  // Broker-reported daily totals win when available.
  for (const [date, bySymbol] of data.officialDayPnl) {
    ensure(date).grossPnl = [...bySymbol.values()].reduce((s, v) => s + v, 0);
  }
  for (const [date, fees] of data.feesByDate) ensure(date).fees += fees;
  for (const cur of m.values()) cur.pnl = cur.grossPnl - cur.fees;
  return m;
}

export const fmtMoney = (v: number) =>
  `${v < 0 ? "-" : "+"}$${Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const fmtMoneyShort = (v: number) =>
  `${v < 0 ? "-" : "+"}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
```


---

## `src/lib/pnlStore.ts`

```ts
import { useSyncExternalStore } from "react";
import {
  DEFAULT_COMMISSIONS,
  buildDataset,
  type CommissionSettings,
  type Dataset,
  type Fill,
} from "@/lib/pnl";

const KEY = "pnl-calendar-data-v1";
const COMM_KEY = "pnl-calendar-commissions-v1";

type Persisted = {
  fills: Fill[];
  files: string[];
  official: [string, [string, number][]][];
};

let commissions: CommissionSettings = DEFAULT_COMMISSIONS;
let commLoaded = false;

function loadCommissions(): CommissionSettings {
  if (commLoaded) return commissions;
  commLoaded = true;
  if (typeof window === "undefined") return commissions;
  try {
    const raw = window.localStorage.getItem(COMM_KEY);
    if (raw) commissions = { ...DEFAULT_COMMISSIONS, ...(JSON.parse(raw) as CommissionSettings) };
  } catch {
    /* ignore */
  }
  return commissions;
}

let dataset: Dataset | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function load(): Dataset | null {
  if (loaded) return dataset;
  loaded = true;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Persisted;
    const official = new Map(p.official.map(([d, rows]) => [d, new Map(rows)]));
    dataset = buildDataset(p.fills, p.files, official, loadCommissions());
  } catch {
    dataset = null;
  }
  return dataset;
}

function persist(d: Dataset | null) {
  if (typeof window === "undefined") return;
  if (!d) {
    window.localStorage.removeItem(KEY);
    return;
  }
  const payload: Persisted = {
    fills: d.fills,
    files: d.files,
    official: [...d.officialDayPnl].map(([date, m]) => [date, [...m]]),
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* quota — keep in memory only */
  }
}

export function setDataset(d: Dataset | null) {
  loaded = true;
  dataset = d;
  persist(d);
  emit();
}

export function getCommissions(): CommissionSettings {
  return loadCommissions();
}

export function setCommissions(next: CommissionSettings) {
  loadCommissions();
  commissions = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(COMM_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  if (dataset) {
    dataset = buildDataset(dataset.fills, dataset.files, dataset.officialDayPnl, next);
  }
  emit();
}

export function useCommissions(): CommissionSettings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => loadCommissions(),
    () => DEFAULT_COMMISSIONS,
  );
}

export function useDataset(): Dataset | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => load(),
    () => null,
  );
}
```


---

## `src/components/pnl/PnlCalendar.tsx`

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BarChart3, ChevronLeft, ChevronRight, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCommissions, setCommissions, setDataset, useCommissions, useDataset } from "@/lib/pnlStore";
import {
  buildDataset,
  dailyTotals,
  dayRows,
  fmtMoney,
  fmtMoneyShort,
  parseStatement,
  instrumentKind,
  type Fill,
  type InstrumentKind,
} from "@/lib/pnl";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function prettyDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PnlCalendar() {
  const data = useDataset();
  const comm = useCommissions();
  const [status, setStatus] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Jump to the latest day whenever a dataset is present (also after a reload).
  useEffect(() => {
    if (!data || selected) return;
    const last = data.fills[data.fills.length - 1];
    if (!last) return;
    const [y, m] = last.date.split("-").map(Number);
    setCursor(new Date(y!, m! - 1, 1));
    setSelected(last.date);
  }, [data, selected]);

  async function ingest(fileList: FileList | null) {
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    const all: Fill[] = data ? [...data.fills] : [];
    const names = data ? [...data.files] : [];
    const official = new Map(data ? data.officialDayPnl : []);
    for (const file of files) {
      const text = await file.text();
      const parsed = parseStatement(text, file.name);
      all.push(...parsed.fills);
      for (const [date, bySymbol] of parsed.officialDayPnl) official.set(date, bySymbol);
      names.push(file.name);
    }
    const next = buildDataset(all, names, official, getCommissions());

    setDataset(next);
    setStatus(
      `Read ${all.length} fills from ${names.length} file${names.length > 1 ? "s" : ""}; matched ${
        next.closed.length
      } closed trades, ${next.openPositions.length} still open.`,
    );
    const last = next.fills[next.fills.length - 1];
    if (last) {
      const [y, m] = last.date.split("-").map(Number);
      setCursor(new Date(y!, m! - 1, 1));
      setSelected(last.date);
    }
  }


  const totals = useMemo(() => (data ? dailyTotals(data) : new Map()), [data]);

  const monthDays = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1).getDay();
    const count = new Date(y, m + 1, 0).getDate();
    const cells: (string | null)[] = Array.from({ length: first }, () => null);
    for (let d = 1; d <= count; d++) cells.push(iso(y, m, d));
    return cells;
  }, [cursor]);

  const summary = useMemo(() => {
    if (!data) return null;
    const days = [...totals.entries()] as [
      string,
      { pnl: number; fees: number; trades: number },
    ][];
    const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const inMonth = days.filter(([d]) => d.startsWith(monthKey));
    const pnl = inMonth.reduce((s, [, v]) => s + v.pnl, 0);
    const fees = inMonth.reduce((s, [, v]) => s + v.fees, 0);
    const wins = inMonth.filter(([, v]) => v.pnl > 0).length;
    const best = inMonth.reduce((b, x) => (x[1].pnl > (b?.[1].pnl ?? -Infinity) ? x : b), null as
      | [string, { pnl: number; trades: number }]
      | null);
    const worst = inMonth.reduce((b, x) => (x[1].pnl < (b?.[1].pnl ?? Infinity) ? x : b), null as
      | [string, { pnl: number; trades: number }]
      | null);
    return {
      pnl,
      days: inMonth.length,
      winRate: inMonth.length ? Math.round((wins / inMonth.length) * 100) : 0,
      fees,
      best: best?.[1].pnl ?? 0,
      worst: worst?.[1].pnl ?? 0,
    };
  }, [data, totals, cursor]);

  const rows = useMemo(
    () => (data && selected ? dayRows(data, selected) : []),
    [data, selected],
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">PnL Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drop in a broker CSV export — columns are matched automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <Button variant="secondary" asChild>
              <Link to="/tickers">
                <BarChart3 /> Ticker P/L
              </Link>
            </Button>
          )}
          <Button onClick={() => inputRef.current?.click()}>
            <Upload /> Import CSVs
          </Button>
          {data && (
            <Button
              variant="secondary"
              onClick={() => {
                setDataset(null);
                setSelected(null);
                setStatus(null);
              }}
            >
              <Trash2 /> Clear
            </Button>
          )}
        </div>

      </header>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        multiple
        className="hidden"
        onChange={(e) => void ingest(e.target.files)}
      />

      <div className="mt-4 flex flex-wrap items-end gap-4 rounded-2xl bg-card p-4">
        <p className="text-xs font-medium tracking-wider text-muted-foreground">
          BROKER COMMISSIONS
          <span className="mt-1 block max-w-xs text-[11px] font-normal normal-case tracking-normal">
            Used when the statement has no commission column.
          </span>
        </p>
        <FeeInput
          label="Per contract"
          value={comm.perContract}
          onChange={(v) => setCommissions({ ...comm, perContract: v })}
        />
        <FeeInput
          label="Per share"
          value={comm.perShare}
          onChange={(v) => setCommissions({ ...comm, perShare: v })}
        />
        <FeeInput
          label="Per trade"
          value={comm.perTrade}
          onChange={(v) => setCommissions({ ...comm, perTrade: v })}
        />
      </div>

      {status && <p className="mt-4 text-sm text-muted-foreground">{status}</p>}

      {!data ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void ingest(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className="mt-8 cursor-pointer rounded-2xl border border-dashed border-border p-20 text-center transition-colors hover:border-primary/60"
        >
          <Upload className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">Drop your CSVs here</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Select or drop as many files as you like — they merge together. Headers, extra preamble
            rows, currency symbols and odd date formats are handled for you.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            >
              <ChevronLeft />
            </Button>
            <h2 className="w-56 text-center text-xl font-semibold">
              {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h2>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            >
              <ChevronRight />
            </Button>
          </div>

          {summary && (
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-5">
              <Stat label="Total P&L" value={fmtMoneyShort(summary.pnl)} tone={summary.pnl} />
              <Stat label="Commissions" value={`-$${summary.fees.toFixed(2)}`} />
              <Stat label="Win rate" value={`${summary.winRate}%`} />
              <Stat label="Best day" value={fmtMoneyShort(summary.best)} tone={summary.best} />
              <Stat label="Worst day" value={fmtMoneyShort(summary.worst)} tone={summary.worst} />
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="rounded-2xl bg-card p-4">
              <div className="grid grid-cols-7 gap-2 pb-2 text-center text-xs font-medium tracking-wider text-muted-foreground">
                {WEEKDAYS.map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {monthDays.map((day, i) => {
                  if (!day) return <div key={`e${i}`} />;
                  const t = totals.get(day) as { pnl: number; trades: number } | undefined;
                  const positive = (t?.pnl ?? 0) >= 0;
                  return (
                    <button
                      key={day}
                      onClick={() => setSelected(day)}
                      className={cn(
                        "flex h-24 flex-col rounded-xl border border-transparent bg-secondary/60 p-2 text-left text-sm transition-colors hover:border-primary/50",
                        t && (positive ? "bg-profit-surface/70" : "bg-loss-surface/70"),
                        selected === day && "border-foreground/70",
                      )}
                    >
                      <span className="text-xs text-muted-foreground">
                        {Number(day.slice(8))}
                      </span>
                      {t && (
                        <span className="mt-auto">
                          <span className="block font-semibold">{fmtMoney(t.pnl)}</span>
                          <span className="block text-xs opacity-80">{t.trades} trades</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <aside className="rounded-2xl bg-card p-5">
              {!selected ? (
                <p className="text-sm text-muted-foreground">
                  Select a day to see the tickers you played.
                </p>
              ) : (
                <>
                  <h3 className="text-xs font-semibold tracking-wider text-muted-foreground">
                    {prettyDate(selected).toUpperCase()}
                  </h3>
                  <p className="mt-1 text-2xl font-bold">
                    <span
                      className={
                        (totals.get(selected)?.pnl ?? 0) >= 0 ? "text-profit" : "text-loss"
                      }
                    >
                      {fmtMoney(totals.get(selected)?.pnl ?? 0)}
                    </span>
                  </p>
                  {(totals.get(selected)?.fees ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      net of ${(totals.get(selected)?.fees ?? 0).toFixed(2)} commissions (gross{" "}
                      {fmtMoney(totals.get(selected)?.grossPnl ?? 0)})
                    </p>
                  )}
                  {rows.length === 0 ? (
                    <p className="mt-4 text-sm text-muted-foreground">No trades on this day.</p>
                  ) : (
                    <ul className="mt-4 space-y-3">
                      {rows.map((r) => (
                        <li key={r.key} className="rounded-xl bg-secondary/60 p-3">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="flex items-center gap-2 font-semibold">
                              <KindBadge kind={r.kind} />
                              {r.label}
                            </span>
                            <span
                              className={cn(
                                "font-semibold",
                                r.pnl > 0 && "text-profit",
                                r.pnl < 0 && "text-loss",
                                r.pnl === 0 && "text-muted-foreground",
                              )}
                            >
                              {r.pnl === 0 ? "—" : fmtMoney(r.pnl)}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {(() => {
                              const unit = r.kind === "stock" ? "shares" : "contracts";
                              return (
                                <>
                                  {r.qty > 0 && (
                                    <span>
                                      {r.qty} {unit} closed
                                    </span>
                                  )}
                                  {r.openedQty > 0 && (
                                    <span>
                                      {r.openedQty} {unit} opened
                                    </span>
                                  )}
                                  {r.avgEntry > 0 && <span>entry ${r.avgEntry.toFixed(2)}</span>}
                                  {r.avgExit > 0 && <span>exit ${r.avgExit.toFixed(2)}</span>}
                                  <span>
                                    {r.fills} fill{r.fills === 1 ? "" : "s"}
                                  </span>
                                  {r.fees > 0 && <span>fees ${r.fees.toFixed(2)}</span>}
                                  {r.carriedQty > 0 && (
                                    <span title="Opened before this statement — cost basis not in the file">
                                      {r.carriedQty} carried in
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                            <StatusChip status={r.status} openQty={r.openQty} kind={r.kind} />
                          </div>
                        </li>


                      ))}
                    </ul>
                  )}

                  {data.openPositions.length > 0 && (
                    <div className="mt-6 border-t border-border pt-4">
                      <h4 className="text-xs font-semibold tracking-wider text-muted-foreground">
                        STILL OPEN
                      </h4>
                      <ul className="mt-2 space-y-2 text-sm">
                        {data.openPositions.map((p) => {
                          const kind = instrumentKind(p.label);
                          const unit =
                            kind === "stock"
                              ? Math.abs(p.qty) === 1
                                ? "share"
                                : "shares"
                              : Math.abs(p.qty) === 1
                                ? "contract"
                                : "contracts";
                          return (
                            <li key={p.key} className="flex justify-between gap-3">
                              <span className="flex items-center gap-2">
                                <KindBadge kind={kind} />
                                {p.label}{" "}
                                <span className="text-muted-foreground">
                                  {p.qty > 0 ? "long" : "short"} {Math.abs(p.qty)} {unit}
                                </span>
                              </span>
                              <span className="text-muted-foreground">
                                avg ${p.avgPrice.toFixed(2)} · since {prettyDate(p.openedOn)}
                              </span>
                            </li>
                          );
                        })}

                      </ul>
                    </div>
                  )}
                </>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function FeeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="text-xs text-muted-foreground">
      <span className="block">{label}</span>
      <span className="mt-1 flex items-center gap-1 rounded-lg bg-secondary/60 px-2 py-1 text-sm text-foreground">
        $
        <input
          type="number"
          min={0}
          step="0.01"
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="w-20 bg-transparent outline-none"
        />
      </span>
    </label>
  );
}

function KindBadge({ kind }: { kind: InstrumentKind }) {
  const map = {
    call: { text: "C", cls: "bg-profit/20 text-profit", title: "Call option" },
    put: { text: "P", cls: "bg-loss/20 text-loss", title: "Put option" },
    stock: { text: "Stock", cls: "bg-secondary text-foreground", title: "Stock" },
  } as const;
  const m = map[kind];
  return (
    <span
      title={m.title}
      className={cn(
        "inline-flex min-w-6 items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-bold",
        m.cls,
      )}
    >
      {m.text}
    </span>
  );
}

function StatusChip({
  status,
  openQty,
  kind,
}: {
  status: string;
  openQty: number;
  kind: InstrumentKind;
}) {
  const unit = kind === "stock" ? "shares" : "contracts";
  const label =
    status === "closed"
      ? "Closed"
      : status === "carried-out"
        ? "Held overnight · closed later"
        : status === "partial"
          ? `Still holding ${Math.abs(openQty)} ${unit}`
          : `Open · ${Math.abs(openQty)} ${unit} held`;


  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        status === "closed"
          ? "bg-secondary text-muted-foreground"
          : "bg-primary/20 text-primary-foreground",
      )}
    >
      {label}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div className="rounded-2xl bg-card p-5">
      <p
        className={cn(
          "text-2xl font-bold",
          tone !== undefined && tone > 0 && "text-profit",
          tone !== undefined && tone < 0 && "text-loss",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs font-medium tracking-wider text-muted-foreground">
        {label.toUpperCase()}
      </p>
    </div>
  );
}
```


---

## `src/routes/index.tsx`

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { PnlCalendar } from "@/components/pnl/PnlCalendar";

const title = "PnL Calendar — Daily Trading P&L from Broker CSVs";
const description =
  "Import broker CSV exports and see daily profit and loss on a calendar, with per-ticker results and open position status for each trading day.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <PnlCalendar />
    </main>
  );
}
```


---

## `src/routes/tickers.tsx`

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDataset } from "@/lib/pnlStore";
import { fmtMoney, fmtMoneyShort, symbolGroups, type InstrumentKind } from "@/lib/pnl";

const title = "Ticker P&L — Profit and Loss by Symbol and Contract";
const description =
  "See realized profit and loss for every ticker you traded, broken down by call, put and stock, with open positions and trade counts.";

export const Route = createFileRoute("/tickers")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TickersPage,
});

function KindBadge({ kind }: { kind: InstrumentKind }) {
  const map = {
    call: { text: "C", cls: "bg-profit/20 text-profit", title: "Call option" },
    put: { text: "P", cls: "bg-loss/20 text-loss", title: "Put option" },
    stock: { text: "Stock", cls: "bg-secondary text-foreground", title: "Stock" },
  } as const;
  const m = map[kind];
  return (
    <span
      title={m.title}
      className={cn(
        "inline-flex min-w-6 items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-bold",
        m.cls,
      )}
    >
      {m.text}
    </span>
  );
}

function TickersPage() {
  const data = useDataset();
  const groups = data ? symbolGroups(data) : [];
  const total = groups.reduce((s, g) => s + g.pnl, 0);
  const winners = groups.filter((g) => g.pnl > 0).length;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to calendar
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Ticker P&amp;L</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Realized profit and loss for every symbol and contract in your imported statements.
        </p>

        {!data || groups.length === 0 ? (
          <p className="mt-10 rounded-2xl bg-card p-10 text-center text-sm text-muted-foreground">
            No data yet — import a CSV on the calendar page first.
          </p>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat label="Total P&L" value={fmtMoneyShort(total)} tone={total} />
              <Stat
                label="Commissions"
                value={`-$${(data?.totalFees ?? 0).toFixed(2)}`}
              />
              <Stat label="Green symbols" value={`${winners}/${groups.length}`} />
              <Stat
                label="Best symbol"
                value={groups[0] ? `${groups[0].symbol} ${fmtMoneyShort(groups[0].pnl)}` : "—"}
                tone={groups[0]?.pnl ?? 0}
              />
            </div>

            <div className="mt-6 space-y-4">
              {groups.map((g) => (
                <section key={g.symbol} className="rounded-2xl bg-card p-5">
                  <header className="flex items-baseline justify-between gap-4">
                    <h2 className="text-lg font-semibold">{g.symbol}</h2>
                    <span
                      className={cn(
                        "text-lg font-bold",
                        g.pnl > 0 && "text-profit",
                        g.pnl < 0 && "text-loss",
                        g.pnl === 0 && "text-muted-foreground",
                      )}
                    >
                      {fmtMoney(g.pnl)}
                    </span>
                  </header>
                  {g.fees > 0 && (
                    <p className="text-xs text-muted-foreground">
                      net of ${g.fees.toFixed(2)} commissions
                    </p>
                  )}
                  <ul className="mt-3 space-y-2">
                    {g.rows.map((r) => {
                      const unit = r.kind === "stock" ? "shares" : "contracts";
                      return (
                        <li key={r.key} className="rounded-xl bg-secondary/60 p-3">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="flex items-center gap-2 font-medium">
                              <KindBadge kind={r.kind} />
                              {r.label}
                            </span>
                            <span
                              className={cn(
                                "font-semibold",
                                r.pnl > 0 && "text-profit",
                                r.pnl < 0 && "text-loss",
                                r.pnl === 0 && "text-muted-foreground",
                              )}
                            >
                              {r.pnl === 0 ? "—" : fmtMoney(r.pnl)}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              {r.qty} {unit} closed
                            </span>
                            <span>
                              {r.wins}W / {r.losses}L
                            </span>
                            <span>
                              {r.days.length} day{r.days.length === 1 ? "" : "s"}
                            </span>
                            {r.carriedQty > 0 && <span>{r.carriedQty} carried in</span>}
                            {r.openQty !== 0 && (
                              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-primary-foreground">
                                Still holding {Math.abs(r.openQty)} {unit} @ $
                                {r.avgOpenPrice.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div className="rounded-2xl bg-card p-5">
      <p
        className={cn(
          "text-xl font-bold",
          tone !== undefined && tone > 0 && "text-profit",
          tone !== undefined && tone < 0 && "text-loss",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs font-medium tracking-wider text-muted-foreground">
        {label.toUpperCase()}
      </p>
    </div>
  );
}
```


---

## `src/routes/__root.tsx`

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lovable App" },
      { name: "description", content: "Lovable Generated Project" },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Lovable App" },
      { property: "og:description", content: "Lovable Generated Project" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
```


---

## `src/styles.css`

```css
@import "tailwindcss" source(none);
@source "../src";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

/*
 * Design system definition.
 *
 * The @theme inline block maps CSS custom properties to Tailwind utility
 * classes (e.g. --color-primary -> bg-primary, text-primary).
 *
 * The :root and .dark blocks define the actual color values using oklch.
 * All colors MUST use oklch format.
 *
 * To add a new semantic color:
 * 1. Add the variable to :root (light value) and .dark (dark value)
 * 2. Register it in @theme inline as --color-<name>: var(--<name>)
 */

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);
  --radius-3xl: calc(var(--radius) + 12px);
  --radius-4xl: calc(var(--radius) + 16px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-profit: var(--profit);
  --color-profit-surface: var(--profit-surface);
  --color-loss: var(--loss);
  --color-loss-surface: var(--loss-surface);
  --color-ring-offset-background: var(--background);

  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

:root {
  --radius: 0.875rem;
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.97 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.97 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.97 0 0);
  --primary: oklch(0.62 0.19 285);
  --primary-foreground: oklch(0.99 0 0);
  --secondary: oklch(0.25 0 0);
  --secondary-foreground: oklch(0.97 0 0);
  --muted: oklch(0.25 0 0);
  --muted-foreground: oklch(0.68 0 0);
  --accent: oklch(0.72 0.19 152);
  --accent-foreground: oklch(0.16 0 0);
  --destructive: oklch(0.62 0.22 25);
  --destructive-foreground: oklch(0.99 0 0);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 14%);
  --ring: oklch(0.62 0.19 285);
  --profit: oklch(0.78 0.18 152);
  --profit-surface: oklch(0.55 0.14 152);
  --loss: oklch(0.68 0.19 25);
  --loss-surface: oklch(0.45 0.16 25);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.97 0 0);
  --sidebar-primary: oklch(0.62 0.19 285);
  --sidebar-primary-foreground: oklch(0.99 0 0);
  --sidebar-accent: oklch(0.25 0 0);
  --sidebar-accent-foreground: oklch(0.97 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.62 0.19 285);
}


.dark {
  --background: oklch(0.129 0.042 264.695);
  --foreground: oklch(0.984 0.003 247.858);
  --card: oklch(0.208 0.042 265.755);
  --card-foreground: oklch(0.984 0.003 247.858);
  --popover: oklch(0.208 0.042 265.755);
  --popover-foreground: oklch(0.984 0.003 247.858);
  --primary: oklch(0.929 0.013 255.508);
  --primary-foreground: oklch(0.208 0.042 265.755);
  --secondary: oklch(0.279 0.041 260.031);
  --secondary-foreground: oklch(0.984 0.003 247.858);
  --muted: oklch(0.279 0.041 260.031);
  --muted-foreground: oklch(0.704 0.04 256.788);
  --accent: oklch(0.279 0.041 260.031);
  --accent-foreground: oklch(0.984 0.003 247.858);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: oklch(0.984 0.003 247.858);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.551 0.027 264.364);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.208 0.042 265.755);
  --sidebar-foreground: oklch(0.984 0.003 247.858);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.984 0.003 247.858);
  --sidebar-accent: oklch(0.279 0.041 260.031);
  --sidebar-accent-foreground: oklch(0.984 0.003 247.858);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.551 0.027 264.364);
}

@layer base {
  * {
    border-color: var(--color-border);
  }

  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
  }
}
```


---

## `package.json`

```json
{
  "name": "tanstack_start_ts",
  "private": true,
  "sideEffects": false,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "build:dev": "vite build --mode development",
    "preview": "vite preview",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "overrides": {
    "rolldown": "1.2.1"
  },
  "dependencies": {
    "@hookform/resolvers": "^5.2.2",
    "@radix-ui/react-accordion": "^1.2.12",
    "@radix-ui/react-alert-dialog": "^1.1.15",
    "@radix-ui/react-aspect-ratio": "^1.1.8",
    "@radix-ui/react-avatar": "^1.1.11",
    "@radix-ui/react-checkbox": "^1.3.3",
    "@radix-ui/react-collapsible": "^1.1.12",
    "@radix-ui/react-context-menu": "^2.2.16",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-dropdown-menu": "^2.1.16",
    "@radix-ui/react-hover-card": "^1.1.15",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-menubar": "^1.1.16",
    "@radix-ui/react-navigation-menu": "^1.2.14",
    "@radix-ui/react-popover": "^1.1.15",
    "@radix-ui/react-progress": "^1.1.8",
    "@radix-ui/react-radio-group": "^1.3.8",
    "@radix-ui/react-scroll-area": "^1.2.10",
    "@radix-ui/react-select": "^2.2.6",
    "@radix-ui/react-separator": "^1.1.8",
    "@radix-ui/react-slider": "^1.3.6",
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-switch": "^1.2.6",
    "@radix-ui/react-tabs": "^1.1.13",
    "@radix-ui/react-toggle": "^1.1.10",
    "@radix-ui/react-toggle-group": "^1.1.11",
    "@radix-ui/react-tooltip": "^1.2.8",
    "@tailwindcss/vite": "^4.2.1",
    "@tanstack/react-query": "^5.101.1",
    "@tanstack/react-router": "1.170.18",
    "@tanstack/react-start": "1.168.32",
    "@tanstack/router-plugin": "1.168.23",
    "@types/papaparse": "^5.5.2",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "date-fns": "^4.1.0",
    "embla-carousel-react": "^8.6.0",
    "input-otp": "^1.4.2",
    "lucide-react": "^0.575.0",
    "papaparse": "^5.7.0",
    "react": "^19.2.0",
    "react-day-picker": "^9.14.0",
    "react-dom": "^19.2.0",
    "react-hook-form": "^7.71.2",
    "react-resizable-panels": "^4.6.5",
    "recharts": "^2.15.4",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.5.0",
    "tailwindcss": "^4.2.1",
    "tw-animate-css": "^1.3.4",
    "vaul": "^1.1.2",
    "vite-tsconfig-paths": "^6.0.2",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@eslint/js": "^9.32.0",
    "@lovable.dev/vite-tanstack-config": "^2.15.0",
    "@types/node": "^22.16.5",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^5.2.0",
    "eslint": "^9.32.0",
    "eslint-config-prettier": "^10.1.1",
    "eslint-plugin-prettier": "^5.2.6",
    "eslint-plugin-react-hooks": "^5.2.0",
    "eslint-plugin-react-refresh": "^0.4.20",
    "globals": "^15.15.0",
    "nitro": "3.0.260603-beta",
    "prettier": "^3.7.3",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.56.1",
    "vite": "8.1.5"
  }
}
```


---

## `vite.config.ts`

```ts
// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
```
