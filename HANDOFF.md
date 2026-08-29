# PnL Calendar — Handoff / Overview

A short, practical overview of **what this project is for** and **what has been built**.
For the deep architecture write-up see [`PNL_CALENDAR_PROJECT.md`](./PNL_CALENDAR_PROJECT.md);
for setup see [`README.md`](./README.md).

---

## 1. Use case

A personal **trading journal** for options and stock traders.

The problem it solves: brokers give you a raw "Account Statement" CSV — a flat list of
fills — and nothing that tells you *how you actually traded*. This app turns that CSV into:

- a **monthly calendar** where every day is colored by realized P&L (green/red), with
  win/loss/breakeven trade counts per day;
- a **year heatmap** view of the whole year at a glance;
- a **per-day breakdown** — which tickers you traded that day, each trade's P&L, and
  whether the position is still open;
- a **per-ticker P&L page** — cumulative profit/loss by symbol, sortable, with a
  horizontal bar scaled to each symbol's contribution;
- an **equity curve** — cumulative P&L over time, openable as a drawer that overlays your
  return % against SPY / QQQ / Nasdaq / Dow / Russell (pulled live from Yahoo);
- an **automated review** ("Blog" / journal agent) — a pure-heuristics engine that reads
  your history and writes plain-language observations (streaks, best/worst days, revenge
  trading patterns, commission drag, etc.).

**No login, no backend database.** The CSV is parsed entirely in the browser and the
journal is persisted to `localStorage`. When run behind the bundled Node server it also
mirrors the whole journal to `~/.pnl-calendar/state.json` so two devices on the same
network share one journal.

Built and tested against **Thinkorswim / Schwab** "Account Statement" exports.

---

## 2. Stack

| Layer | Choice |
|---|---|
| Framework | TanStack Start v1 (React 19, TanStack Router file routes) |
| Build | Vite, Nitro node-server output |
| Styling | Tailwind CSS v4, shadcn/ui (Radix primitives) |
| Data | `papaparse` for CSV; no DB — `localStorage` + optional server-side JSON file |
| Charts | Recharts + hand-written inline SVG |

Routes: `/` (calendar), `/tickers` (per-symbol P&L), `/blog` (journal review).
Core logic lives in pure, React-free modules under `src/lib/` (`pnl.ts` = all parsing +
P&L math, `blog.ts` = the review engine, `pnlStore.ts` = the persistent store).

---

## 3. What has been built (history)

Starting from an initial import, the project grew through many small iterations. The main
milestones:

**Core journal**
- CSV statement parser: signed-qty fills → matched round trips (`ClosedTrade`) + leftover
  inventory (`OpenPosition`); handles options multipliers, "TO OPEN / TO CLOSE" position
  effects, carried positions, and broker P/L columns when present.
- Commission / fee accounting per fill, per date, and per instrument.
- Import as a **file list**: add multiple statements, remove any one, undo the last import.
- JSON backup / restore; CSV re-export of fills.

**Calendar**
- Month grid (weekdays only, 5 columns) with per-day P&L color and `xW / yL / zBE` counts.
- Month / Year toggle; year view is a weekday heatmap of the whole year.
- Selected-day sidebar with per-ticker rows, scoped to the calendar's height.
- All-time **Insights** panel below the calendar (powered by the review engine).

**Per-ticker page**
- Collapsible symbol rows, expand for detail.
- Sort by P&L / trades / etc. with asc/desc toggle.
- Horizontal bar per symbol scaled to its P&L contribution.

**Equity curve**
- Cumulative P&L line in the Insights panel; click to open a full drawer.
- Drawer overlays your return % (editable principal, default $100k) against 5 major
  indexes, auto-pulled from Yahoo via a TanStack Start server function (cache-aware).

**Journal agent (`/blog`)**
- `analyze()` + `journal()` — pure heuristics that produce stats and written observations.

**Cross-device sync**
- When served by Node, the entire journal is mirrored to `~/.pnl-calendar/state.json`
  (override with `PNL_DATA_DIR`) so a laptop and a phone share one journal.

**Latest change — lucky-charm totem** (`src/components/pnl/LuckyCharm.tsx`, `src/lib/quotes.ts`)
- A nimbu-mirchi (lemon + three chilies) charm hanging off the right of the nav bar with a
  pull-cord. Drag the bead down like a light switch and release — it recoils and a random
  quote drops down, tagged **Trading** or **Real life**. 35 quotes total; `randomQuote()`
  avoids repeating the one just shown. Keyboard accessible (Enter / Space pulls the cord).

---

## 4. Running it

Needs Node.js.

```sh
npm install
npm run dev      # http://localhost:8080
npm run build    # production build → .output
npm run preview  # serve the production build
npm run lint
```

No environment variables are required. The Yahoo index pull and the cross-device mirror
both work out of the box when run via the Node server; `PNL_DATA_DIR` optionally
relocates the mirror file.

---

## 5. Status & limitations

- Parser is tuned to **Thinkorswim / Schwab** statement layout — other brokers likely
  need format work in `parseStatement` (`src/lib/pnl.ts`).
- No auth and no multi-user support by design; the data is yours, on your machine.
- The index comparison depends on Yahoo's public endpoints; if they're unreachable the
  equity drawer just omits the overlay.
- `.env*` is gitignored — nothing secret ships in this repo.
