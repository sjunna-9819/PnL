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
