# PnL Calendar — Project Documentation

A browser-only trading journal: import broker CSV statements (built and tested against
Thinkorswim / Schwab "Account Statement" exports), get a month calendar of daily P&L, a
per-day ticker breakdown with open/closed status, a dedicated per-ticker P&L page, and
broker commission accounting. No backend, no login — everything is parsed in the browser
and persisted in `localStorage`.

---

## 1. Stack & layout

- TanStack Start v1 (React 19, TanStack Router file routes), Vite 7, Tailwind v4, shadcn/ui.
- CSV parsing: `papaparse`.
- No database. State lives in a small external store backed by `localStorage`.

```
src/
  lib/pnl.ts                  # all parsing + P&L math (pure, no React)
  lib/pnlStore.ts             # persistent shared store (useSyncExternalStore + localStorage)
  lib/demoData.ts             # demoDataset() — sample data for the empty state
  lib/blog.ts                 # journal agent: analyze() + journal() heuristics engine (pure)
  components/pnl/PnlCalendar.tsx  # calendar page UI (import, month grid, day sidebar, fee settings)
  components/pnl/NavBar.tsx   # sticky top nav (Calendar / Ticker P/L / Blog), mounted in __root
  components/pnl/shared.tsx   # Stat, KindBadge, TrendArrow — shared across pages
  routes/index.tsx            # "/"        -> PnlCalendar  (validateSearch: ?day=YYYY-MM-DD)
  routes/tickers.tsx          # "/tickers" -> per-symbol P&L page
  routes/blog.tsx             # "/blog"    -> automated trading-journal review
  routes/__root.tsx           # root layout + NavBar + <Toaster/>
  styles.css                  # dark theme + profit/loss design tokens
```

---

## 2. The data model (`src/lib/pnl.ts`)

### `Fill` — one execution from the statement
| field | meaning |
|---|---|
| `ts`, `date` | sortable timestamp, `yyyy-mm-dd` |
| `symbol` | underlying, e.g. `QQQ` |
| `label` / `key` | instrument identity, e.g. `QQQ 27-Aug-26 712 CALL` (stocks: just the symbol) |
| `qty` | **signed**: `+` buy, `−` sell |
| `price` | fill price |
| `multiplier` | `100` for options, `1` for stock |
| `pnl` / `hasPnlColumn` | used only when the broker file has a P/L column |
| `csvFee` | commissions + fees reported by the broker for that fill (positive cost) |
| `posEffect` | `"open"` \| `"close"` \| `""` — from the **Pos Effect** column (TO OPEN / TO CLOSE) |

### Derived types
- `ClosedTrade` — a matched round trip: `{date, symbol, label, key, qty, pnl, carried}`.
  `carried: true` = the position was opened *before* this statement, so no cost basis exists in the file.
- `OpenPosition` — leftover inventory: `{qty (signed), avgPrice, openedOn}`.
- `DaySymbolRow` — one row in the day sidebar (see §5).
- `TickerRow` / `SymbolGroup` — rows on `/tickers`.
- `Dataset` — `{fills, closed, openPositions, officialDayPnl, files, commissions, feesByDate, feesByKey, totalFees}`.

---

## 3. CSV parsing pipeline (`parseStatement`)

Broker statements are **not** a single table. The pipeline:

1. **Papaparse in raw array mode** (`skipEmptyLines`) — no header assumption.
2. **`sections()`** splits the file into blocks. A row with a single non-empty cell is a
   *block title* (e.g. `Account Trade History`); a row scoring ≥ 4 on `headerScore()`
   (date/symbol/qty/price/pnl keyword hits) becomes that block's *header*; everything after
   is the body.
3. **Block selection**: prefer blocks whose title matches `/trade history/i`. Explicitly
   **exclude Order History** (`isOrderHistory`: title match or a `Status` column) — order
   history contains CANCELED/REJECTED orders and was the original source of phantom trades.
4. **Flexible column matching** via regexes (`DATE_KEYS`, `SYMBOL_KEYS`, `QTY_KEYS`,
   `SIDE_KEYS`, `PRICE_KEYS`, `PNL_KEYS`, `EXP_KEYS`, `STRIKE_KEYS`, `TYPE_KEYS`,
   `POS_EFFECT_KEYS`, `COMM_KEYS`, `FEES_KEYS`). Columns can appear in any order/casing.
5. **Normalization**
   - `num()` — strips `$ , spaces`, handles `(1,234.50)` parentheses-negatives and `+`/`−`.
   - `parseDateTime()` — accepts `yyyy-mm-dd`, `m/d/yy`, `d-MMM-yy`; extracts `hh:mm[:ss]`
     into the sortable `ts` so same-day fills match in true chronological order.
   - Side words (`SELL/SLD/STO/STC/SHORT` vs `BUY/BOT/BTO/BTC`) fix the sign of `qty`.
   - Options (`Type` = PUT/CALL) get `label = "SYMBOL EXP STRIKE TYPE"` and `multiplier = 100`.
   - Junk rows (`TOTAL`, `CASH`, `BALANCE`, `SUBTOTAL`) are dropped.
6. **Official P&L block**: if a `Profits and Losses` block with a `P/L Day` column exists,
   its per-symbol values are stored in `officialDayPnl: date -> symbol -> pnl` for the
   statement's last date. This is the broker's own authoritative daily figure.

---

## 4. P&L engine (`buildDataset`)

Per instrument `key`, chronologically:

1. **FIFO lot matching** — a fill of opposite sign consumes existing lots.
   `pnl = (exitPrice − entryPrice) × matchedQty × multiplier × direction`
   (`direction = +1` for long lots, `−1` for shorts). If the file has its own P/L column,
   that value is used pro-rata instead.
2. **Residual lots**:
   - Lots created by a `TO CLOSE` fill (`fromClose`) can't be new positions — they were
     opened in a prior statement. They become `ClosedTrade { carried: true, pnl: 0 }`,
     awaiting reconciliation. *(This killed the "still holding 800 NVDA shares" bug.)*
   - All other residual lots become `OpenPosition` with weighted-average price.
3. **Commissions** — `fillFee(fill, settings)` per fill, aggregated into `feesByDate`,
   `feesByKey`, `totalFees` (see §6).

### Reconciliation with the broker (`dayRows`)
When a day contains carried-in closes, their true cost basis is unknown. The engine then
trusts `officialDayPnl` for that symbol: `remainder = brokerDayPnL − sum(known rows)`, and
that remainder is split across the carried rows proportionally to `carriedQty`.

---

## 5. Day breakdown (`dayRows(data, date)`)

Each row (`DaySymbolRow`) reports, per instrument:

- `kind` — `call` / `put` / `stock` from `instrumentKind(label)`.
- `qty` — contracts/shares **actually closed** that day (not fill count — this was the
  "why does it say 300 trades" fix).
- `openedQty` — contracts/shares opened that day.
- `avgEntry` / `avgExit` — quantity-weighted prices of opening/closing fills.
- `fills` — number of executions.
- `carriedQty` — closed today, opened before the statement.
- `grossPnl`, `fees`, `pnl` (= gross − fees).
- `status`:
  | status | meaning | UI text |
  |---|---|---|
  | `closed` | flat at end of day | "Closed" |
  | `partial` | closed some, still holding | "Still holding N contracts/shares" |
  | `open` | opened, nothing closed | "Open · N held" |
  | `carried-out` | opened today, closed on a later day | "Held overnight · closed later" |

`dailyTotals()` returns per-date `{grossPnl, fees, pnl, trades}`; the broker's official
day total overrides the computed gross when present, and commissions are then subtracted.

---

## 6. Broker commissions

- **From the statement first**: `Commissions`, `Comm`, `Fees`, `Misc Fees`, `Reg Fees`,
  `Exchange Fees` columns are summed per fill into `csvFee`.
- **Fallback rates** when the file has no fee columns — `CommissionSettings`:
  `perContract` (default **$0.65**), `perShare` (default **$0**), `perTrade` (flat, default **$0**).
- Fees are charged on **every fill — both the buy and the sell**, for stocks and options alike.
  Options use `perContract`, stocks use `perShare`, `perTrade` is added to each execution.
- Editable in the "Broker commissions" panel on the calendar page; saved under
  `localStorage["pnl-calendar-commissions-v1"]` and applied instantly (dataset rebuilds).
- Everything user-facing (day cells, month stats, day rows, ticker page) shows **net** P&L,
  with gross and fee amounts displayed alongside.

---

## 7. Persistence (`src/lib/pnlStore.ts`)

- `useSyncExternalStore` module store, SSR-safe (server snapshot = `null`).
- `localStorage["pnl-calendar-data-v1"]` holds `{fills, files, official}`; the dataset is
  **rebuilt** from raw fills on load, so any engine improvement applies to already-imported data.
- API: `useDataset()`, `setDataset()`, `useCommissions()`, `getCommissions()`, `setCommissions()`.
- Importing multiple CSVs merges: fills append, official P&L maps merge by date.
- `src/lib/demoData.ts` — `demoDataset()` builds a deterministic sample (two months of
  stock + options trades, 2 left open) straight through `buildDataset`; wired to the
  empty-state "Load demo data" button.

---

## 8. UI

Shared bits live in `src/components/pnl/shared.tsx` (`Stat`, `KindBadge`, `TrendArrow` —
a ▲/▼ glyph so gain/loss is not colour-only). Import feedback and clear/demo actions use
`sonner` toasts (`<Toaster/>` mounted in `__root.tsx`).

**Navigation** — a sticky `NavBar` (mounted in `__root.tsx`, so it's on every route): the
wordmark links home, and three tabs — **Calendar** (`/`), **Ticker P/L** (`/tickers`),
**Blog** (`/blog`). No more per-page back links or in-page nav buttons.

**`/` — PnlCalendar**
- Import button + full-page drag-and-drop, multi-file. Empty state names the supported
  brokers and offers **Load demo data**.
- All-time strip under the title: net P&L, trade count, trading days, first date.
- Month navigation with a **This month** shortcut (shown when off the current month); the
  current date gets a ring; each day cell tinted `profit-surface` / `loss-surface`, showing
  net P&L and trade count.
- Weekly P&L total in a right-hand column of the grid (hidden below `md`).
- Month stats: Total P&L, Commissions, **Green days** (% of trading days that closed
  positive), Best day, Worst day, Avg P&L / trade (month P&L ÷ closed trades), Avg P&L / day
  (month P&L ÷ trading days), Avg P&L / contract (month P&L ÷ contracts+shares closed).
- Commission inputs live in a gear **popover** in the header.
- Day detail (date, net P&L with gross/fee line, per-instrument rows, **STILL OPEN**
  section) renders in the right sidebar on `lg+` and as a bottom **drawer** on mobile.
- "Clear" prompts an **alert dialog** before wiping the dataset.

**`/tickers` — Ticker P&L**
- Stats: Total P&L, Commissions, Green symbols, Best symbol.
- A collapsed **row list** — symbol, contract count, net P&L — one row per symbol. Click a
  row to expand an accordion panel with the per-contract breakdown (badge, net P&L, quantity,
  days traded, W/L, carried-in, remaining open size) and a "View on calendar →" link that
  jumps to `/?day=<first trading day>` (index route `validateSearch`).
- **Symbol filter** + sort toggle (P&L / Name / Volume) above the list.

**`/blog` — Trading journal (the "agent")**
- `src/lib/blog.ts` is a **pure heuristics engine**, no network / no model. `analyze(data)`
  computes ~25 metrics (expectancy, payoff, profit factor, win rate, max drawdown, day/ticker
  concentration, over-trading, revenge-trading, sizing CV, fee drag, call-vs-put bias,
  overnight-option exposure, repeat-offender symbols) and emits `goods` / `bads` / `watch` /
  `advice` strings plus a 0–100 score and letter grade.
- `journal(data)` composes dated `Post[]`: a graded **Coach's review**, one **month note** per
  month with data, and a **By the numbers** stat dump. Re-derived on every dataset change —
  nothing is persisted.
- The page renders posts newest-intent-first as cards; grade badge, tone-coloured section
  headings and bullet dots. Empty state points back to `/` to import.
- To swap in an LLM later: keep `analyze()` for the metrics, feed its output to the model as
  context, replace only the string composition in `journal()`.

**Theme (`src/styles.css`)** — dark base with semantic tokens: `--profit`, `--loss`,
`--profit-surface`, `--loss-surface`. Never hardcode colors in components; use
`text-profit`, `bg-loss-surface`, etc.

---

## 9. Gotchas learned the hard way

1. **Never parse Order History** — canceled/rejected orders inflate trade counts and create
   phantom positions.
2. **Unmatched sells are usually carried-in closes, not new shorts.** Use `Pos Effect`; if a
   residual lot came from a `TO CLOSE` fill, treat it as closed with unknown basis.
3. **Statements without a P/L column** require FIFO — and options must be × 100.
4. **Count closed quantity, not fills**, or a 10-lot scaled out in 3 pieces looks like 30 trades.
5. **Timestamps matter**: same-day sorting by date only mismatches scalps.
6. **Broker "P/L Day" is gross**; subtract commissions yourself.
7. `localStorage` stores raw fills, never the derived dataset — always rebuild.

---

## 10. Extending it

- **New broker**: usually just add its column names to the regex constants at the top of
  `pnl.ts`. If sections differ, adjust `sections()` / `isOrderHistory()`.
- **Per-symbol commission overrides**: extend `CommissionSettings` with a map and branch inside
  `fillFee()` — every consumer already reads fees from `feesByKey` / `feesByDate`.
- **Multi-device sync / accounts**: replace `pnlStore.ts` with a Lovable Cloud table storing
  raw fills per user; `buildDataset` stays untouched.
- **Unrealized P&L**: fetch marks for `openPositions` and add a mark-to-market column.

---

## 11. Quick reference — public API of `pnl.ts`

```ts
parseStatement(text, fileName): { fills, officialDayPnl }
buildDataset(fills, files, officialDayPnl?, commissions?): Dataset
dayRows(dataset, "yyyy-mm-dd"): DaySymbolRow[]
dailyTotals(dataset): Map<date, { pnl, grossPnl, fees, trades }>
tickerRows(dataset): TickerRow[]
symbolGroups(dataset): SymbolGroup[]
instrumentKind(label): "call" | "put" | "stock"
fillFee(fill, commissions): number
fmtMoney(v) / fmtMoneyShort(v)
DEFAULT_COMMISSIONS: { perContract: 0.65, perShare: 0, perTrade: 0 }
```

Full verbatim source of every file is in **PNL_CALENDAR_SOURCE.md**.
