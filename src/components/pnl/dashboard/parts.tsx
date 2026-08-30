import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { loadDemoFiles, setPrincipal, usePrincipal } from "@/lib/pnlStore";
import { DEMO_FILE_NAME, demoFills } from "@/lib/demoData";
import { importStatements } from "@/lib/import";
import { analyze, journal, type Post, type PostTone } from "@/lib/blog";
import { dailyDigest, type DigestTone } from "@/lib/digest";
import { useCoachReview, type CoachState } from "@/lib/coachStore";
import {
  removeBenchmark,
  setBenchmark,
  useBenchmarks,
  type BenchmarkPoint,
} from "@/lib/benchmarks";
import { fetchIndexHistory, YAHOO_SYMBOLS } from "@/lib/marketData";
import { KindBadge, Stat, TrendArrow } from "@/components/pnl/shared";
import {
  dayRows,
  fmtMoney,
  fmtMoneyShort,
  instrumentKind,
  symbolGroups,
  type DayTotal,
  type InstrumentKind,
  type SymbolGroup,
} from "@/lib/pnl";
import { useDash } from "./context";

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI"];
const MONTHS_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

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

/* ------------------------------------------------------------------ *
 *  Shared widget shell                                                *
 * ------------------------------------------------------------------ */

/** A message shown in place of a widget's body before any CSV is imported. */
function NeedsData({ children }: { children: React.ReactNode }) {
  return <p className="p-1 text-xs text-muted-foreground">{children}</p>;
}

/* ------------------------------------------------------------------ *
 *  Period navigation                                                  *
 * ------------------------------------------------------------------ */

export function PeriodNav() {
  const { view, setView, cursor, setCursor, isCurrentPeriod, totals, today, setSelected } =
    useDash();

  return (
    <div className="flex h-full flex-wrap items-center justify-center gap-2">
      <div className="flex items-center gap-0.5 rounded-lg bg-secondary/50 p-0.5">
        {(["month", "year"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
              view === v
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {v}
          </button>
        ))}
      </div>
      <Button
        variant="secondary"
        size="icon"
        className="size-8"
        aria-label={`Previous ${view}`}
        onClick={() =>
          setCursor(
            view === "month"
              ? new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)
              : new Date(cursor.getFullYear() - 1, cursor.getMonth(), 1),
          )
        }
      >
        <ChevronLeft />
      </Button>
      <h2 className="w-40 text-center text-base font-semibold">
        {view === "month"
          ? cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })
          : cursor.getFullYear()}
      </h2>
      <Button
        variant="secondary"
        size="icon"
        className="size-8"
        aria-label={`Next ${view}`}
        onClick={() =>
          setCursor(
            view === "month"
              ? new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
              : new Date(cursor.getFullYear() + 1, cursor.getMonth(), 1),
          )
        }
      >
        <ChevronRight />
      </Button>
      {!isCurrentPeriod && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-muted-foreground"
          onClick={() => {
            setCursor(new Date());
            if (totals.has(today)) setSelected(today);
          }}
        >
          <CalendarClock /> This {view}
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Period summary stats                                               *
 * ------------------------------------------------------------------ */

export function SummaryStats() {
  const { data, totals, period, view } = useDash();

  const summary = useMemo(() => {
    if (!data) return null;
    const inMonth = [...totals.entries()].filter(([d]) => d.startsWith(period));
    const pnl = inMonth.reduce((s, [, v]) => s + v.pnl, 0);
    const trades = inMonth.reduce((s, [, v]) => s + v.trades, 0);
    const monthClosed = data.closed.filter((t) => t.date.startsWith(period));
    const opt = monthClosed.filter((t) => instrumentKind(t.label) !== "stock");
    const stk = monthClosed.filter((t) => instrumentKind(t.label) === "stock");
    const optContracts = opt.reduce((s, t) => s + Math.abs(t.qty), 0);
    const optPnl = opt.reduce((s, t) => s + t.pnl, 0);
    const stkShares = stk.reduce((s, t) => s + Math.abs(t.qty), 0);
    const stkPnl = stk.reduce((s, t) => s + t.pnl, 0);
    const best = inMonth.reduce<[string, DayTotal] | null>(
      (b, x) => (x[1].pnl > (b?.[1].pnl ?? -Infinity) ? x : b),
      null,
    );
    const worst = inMonth.reduce<[string, DayTotal] | null>(
      (b, x) => (x[1].pnl < (b?.[1].pnl ?? Infinity) ? x : b),
      null,
    );
    return {
      pnl,
      best: best?.[1].pnl ?? 0,
      worst: worst?.[1].pnl ?? 0,
      avgPerTrade: trades ? pnl / trades : 0,
      avgPerDay: inMonth.length ? pnl / inMonth.length : 0,
      avgPerContract: optContracts ? optPnl / optContracts : 0,
      avgPerShare: stkShares ? stkPnl / stkShares : 0,
      hasStock: stkShares > 0,
      hasOptions: optContracts > 0,
    };
  }, [data, totals, period]);

  if (!summary) return <NeedsData>Import a statement to see period stats.</NeedsData>;
  const span = view === "month" ? "Month" : "Year";

  return (
    <div className="grid h-full grid-cols-2 content-center gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      <Stat label="Total P&L" value={fmtMoneyShort(summary.pnl)} tone={summary.pnl} />
      <Stat label="Best day" value={fmtMoneyShort(summary.best)} tone={summary.best} />
      <Stat label="Worst day" value={fmtMoneyShort(summary.worst)} tone={summary.worst} />
      <Stat
        label="Avg / trade"
        value={fmtMoneyShort(summary.avgPerTrade)}
        tone={summary.avgPerTrade}
        hint={`${span} P&L ÷ closed trades`}
      />
      <Stat
        label="Avg / day"
        value={fmtMoneyShort(summary.avgPerDay)}
        tone={summary.avgPerDay}
        hint={`${span} P&L ÷ trading days`}
      />
      <Stat
        label="Avg / contract"
        value={summary.hasOptions ? fmtMoney(summary.avgPerContract) : "—"}
        tone={summary.hasOptions ? summary.avgPerContract : undefined}
        hint={`Gross option P&L ÷ option contracts closed this ${view}`}
      />
      <Stat
        label="Avg / share"
        value={summary.hasStock ? fmtMoney(summary.avgPerShare) : "—"}
        tone={summary.hasStock ? summary.avgPerShare : undefined}
        hint={`Gross stock P&L ÷ shares closed this ${view}`}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Calendar (month grid + year heatmap)                               *
 * ------------------------------------------------------------------ */

export function CalendarView() {
  const { data, totals, cursor, view, today, selected, openDetail } = useDash();

  const monthDays = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const count = new Date(y, m + 1, 0).getDate();
    const firstDow = new Date(y, m, 1).getDay();
    const lead = firstDow >= 1 && firstDow <= 5 ? firstDow - 1 : 0;
    const cells: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= count; d++) {
      const dow = new Date(y, m, d).getDay();
      if (dow === 0 || dow === 6) continue;
      cells.push(iso(y, m, d));
    }
    while (cells.length % 5) cells.push(null);
    const weeks: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 5) weeks.push(cells.slice(i, i + 5));
    return weeks;
  }, [cursor]);

  const yearCols = useMemo(() => {
    const y = cursor.getFullYear();
    const out: { monthLabel: string | null; days: (string | null)[] }[] = [];
    let week: (string | null)[] = [null, null, null, null, null];
    let monthLabel: string | null = null;
    const flush = () => {
      if (week.some(Boolean)) out.push({ monthLabel, days: week });
      week = [null, null, null, null, null];
      monthLabel = null;
    };
    const d = new Date(y, 0, 1);
    while (d.getFullYear() === y) {
      const dow = d.getDay();
      if (dow === 1 && week.some(Boolean)) flush();
      if (dow >= 1 && dow <= 5) {
        week[dow - 1] = iso(y, d.getMonth(), d.getDate());
        if (d.getDate() <= 5 && monthLabel === null) monthLabel = MONTHS_ABBR[d.getMonth()]!;
      }
      d.setDate(d.getDate() + 1);
    }
    flush();
    return out;
  }, [cursor]);

  if (!data) return <NeedsData>Import a statement to fill the calendar.</NeedsData>;

  if (view === "year") {
    return (
      <YearHeatmap
        cols={yearCols}
        totals={totals}
        today={today}
        selected={selected}
        onSelect={openDetail}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="grid shrink-0 grid-cols-5 gap-2 pb-1.5 text-center text-[11px] font-medium tracking-wider text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {monthDays.map((week, wi) => (
          <div key={wi} className="grid min-h-0 flex-1 grid-cols-5 gap-2">
            {week.map((day, di) => {
              if (!day) return <div key={`e${wi}-${di}`} />;
              const t = totals.get(day);
              const positive = (t?.pnl ?? 0) >= 0;
              return (
                <button
                  key={day}
                  onClick={() => openDetail(day)}
                  className={cn(
                    "flex min-h-16 flex-col overflow-hidden rounded-lg border border-transparent bg-secondary/60 p-1.5 text-left transition-all hover:border-primary/50",
                    t && (positive ? "bg-profit-surface/60" : "bg-loss-surface/60"),
                    day === today && "ring-1 ring-primary/60",
                    selected === day &&
                      "z-10 scale-[1.03] shadow-xl ring-offset-2 ring-offset-card",
                    selected === day &&
                      t &&
                      (positive
                        ? "bg-profit-surface ring-2 ring-profit"
                        : "bg-loss-surface ring-2 ring-loss"),
                    selected === day && !t && "ring-2 ring-foreground",
                  )}
                >
                  <span className="text-[11px] font-medium leading-none text-foreground">
                    {Number(day.slice(8))}
                  </span>
                  {t && (
                    <span className="mt-auto leading-tight text-foreground">
                      <span className="block text-xs font-semibold tabular-nums sm:text-sm">
                        {fmtMoneyShort(t.pnl)}
                      </span>
                      <span className="flex flex-wrap items-baseline gap-x-1 text-[10px] tabular-nums">
                        <span className="text-muted-foreground">{t.trades}T</span>
                        <span className="text-profit">{t.wins}W</span>
                        <span className="text-loss">{t.losses}L</span>
                        {t.breakeven > 0 && (
                          <span className="text-muted-foreground">{t.breakeven}BE</span>
                        )}
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function YearHeatmap({
  cols,
  totals,
  today,
  selected,
  onSelect,
}: {
  cols: { monthLabel: string | null; days: (string | null)[] }[];
  totals: Map<string, DayTotal>;
  today: string;
  selected: string | null;
  onSelect: (d: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center overflow-auto py-2">
      <div className="flex w-max gap-[3px] pb-1 pl-6 text-[9px] text-muted-foreground">
        {cols.map((c, i) => (
          <div key={i} className="w-3.5 shrink-0 sm:w-4">
            {c.monthLabel ?? ""}
          </div>
        ))}
      </div>
      <div className="flex w-max gap-[3px]">
        <div className="flex shrink-0 flex-col justify-between pr-1 text-[9px] leading-none text-muted-foreground">
          {["M", "T", "W", "T", "F"].map((d, i) => (
            <span key={i} className="flex h-3.5 items-center sm:h-4">
              {d}
            </span>
          ))}
        </div>
        {cols.map((c, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {c.days.map((day, ri) => {
              if (!day) return <div key={ri} className="size-3.5 sm:size-4" />;
              const t = totals.get(day);
              const positive = (t?.pnl ?? 0) >= 0;
              return (
                <button
                  key={day}
                  onClick={() => onSelect(day)}
                  title={
                    t
                      ? `${prettyDate(day)} · ${fmtMoney(t.pnl)} · ${t.wins}W ${t.losses}L`
                      : prettyDate(day)
                  }
                  className={cn(
                    "size-3.5 rounded-[3px] bg-secondary/40 transition-colors hover:ring-1 hover:ring-primary/70 sm:size-4",
                    t && (positive ? "bg-profit-surface/75" : "bg-loss-surface/75"),
                    day === today && "ring-1 ring-primary/70",
                    selected === day && "ring-2 ring-foreground",
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Day detail                                                         *
 * ------------------------------------------------------------------ */

/** The day-detail popup: a centered dialog on desktop, a bottom sheet on mobile. */
export function DayDetailDialog() {
  const { detailDay, closeDetail } = useDash();
  const isMobile = useIsMobile();
  const open = detailDay !== null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => !o && closeDetail()}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerTitle className="sr-only">Day detail</DrawerTitle>
          <div className="overflow-y-auto px-5 pb-8 pt-3">
            {detailDay && <DayDetailBody day={detailDay} />}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeDetail()}>
      <DialogContent className="max-h-[80vh] gap-0 overflow-y-auto sm:max-w-md">
        <DialogTitle className="sr-only">Day detail</DialogTitle>
        {detailDay && <DayDetailBody day={detailDay} />}
      </DialogContent>
    </Dialog>
  );
}

function DayDetailBody({ day }: { day: string }) {
  const { data, totals } = useDash();
  const rows = useMemo(() => (data ? dayRows(data, day) : []), [data, day]);
  const t = totals.get(day);
  const dayPnl = t?.pnl ?? 0;
  if (!data) return null;

  return (
    <>
      <h3 className="text-[10px] font-semibold tracking-wider text-muted-foreground">
        {prettyDate(day).toUpperCase()}
      </h3>
      <p className="mt-0.5 flex items-center gap-1 text-base font-bold">
        <TrendArrow tone={dayPnl} className="size-3.5" />
        <span className={dayPnl >= 0 ? "text-profit" : "text-loss"}>{fmtMoney(dayPnl)}</span>
      </p>
      {t && t.trades > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {t.trades} trade{t.trades === 1 ? "" : "s"} (
          <span className="text-profit">{t.wins}W</span>,{" "}
          <span className="text-loss">{t.losses}L</span>
          {t.breakeven > 0 && <>, {t.breakeven}BE</>})
        </p>
      )}
      {(t?.fees ?? 0) > 0 && (
        <p className="text-[10px] text-muted-foreground">
          net of ${(t?.fees ?? 0).toFixed(2)} commissions (gross {fmtMoney(t?.grossPnl ?? 0)})
        </p>
      )}
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No trades on this day.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => {
            const unit = r.kind === "stock" ? "shares" : "contracts";
            return (
              <li key={r.key} className="rounded-lg bg-secondary/60 p-2 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <KindBadge kind={r.kind} />
                    {r.label}
                  </span>
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      r.pnl > 0 && "text-profit",
                      r.pnl < 0 && "text-loss",
                      r.pnl === 0 && "text-muted-foreground",
                    )}
                  >
                    {r.pnl === 0 ? "—" : fmtMoney(r.pnl)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
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
                  <StatusChip status={r.status} openQty={r.openQty} kind={r.kind} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data.openPositions.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <h4 className="text-[10px] font-semibold tracking-wider text-muted-foreground">
            STILL OPEN
          </h4>
          <ul className="mt-1.5 space-y-1 text-[11px]">
            {data.openPositions.map((p) => {
              const kind = instrumentKind(p.label);
              const one = Math.abs(p.qty) === 1;
              const unit =
                kind === "stock" ? (one ? "share" : "shares") : one ? "contract" : "contracts";
              return (
                <li key={p.key} className="flex justify-between gap-3">
                  <span className="flex items-center gap-1.5">
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
        "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        status === "closed"
          ? "bg-secondary text-muted-foreground"
          : "bg-primary/20 text-primary-foreground",
      )}
    >
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 *  Daily digest                                                       *
 * ------------------------------------------------------------------ */

const digestDot: Record<DigestTone, string> = {
  good: "bg-profit",
  bad: "bg-loss",
  neutral: "bg-muted-foreground",
};

export function DailyDigestWidget() {
  const { data, totals, selected, today, openDetail } = useDash();

  const day = useMemo(() => {
    if (selected) return selected;
    const dates = [...totals.keys()].sort();
    return dates.at(-1) ?? today;
  }, [selected, totals, today]);

  const digest = useMemo(() => (data ? dailyDigest(data, day, totals) : null), [data, day, totals]);

  if (!data || !digest) {
    return (
      <NeedsData>
        Import a statement — the digest writes itself for whatever day you pick.
      </NeedsData>
    );
  }

  const tone =
    digest.mood === "green"
      ? "text-profit"
      : digest.mood === "red"
        ? "text-loss"
        : "text-foreground";

  return (
    <div className="flex h-full flex-col">
      <button
        onClick={() => openDetail(day)}
        className="group -mx-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-secondary/30"
        title="Open the full day breakdown"
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {prettyDate(day)}
          {day === today && " · today"}
        </p>
        <p className={cn("mt-0.5 text-sm font-semibold leading-snug", tone)}>{digest.headline}</p>
      </button>

      <ul className="mt-3 space-y-2 overflow-auto">
        {digest.lines.map((line, i) => (
          <li key={i} className="flex gap-2 text-xs leading-relaxed">
            <span
              className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", digestDot[line.tone])}
              aria-hidden
            />
            <span className="text-foreground/90">{line.text}</span>
          </li>
        ))}
      </ul>

      <p className="mt-auto pt-2 text-[10px] text-muted-foreground">
        Auto-written from this day&apos;s fills. Pick another day on the calendar to refresh.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Equity curve                                                       *
 * ------------------------------------------------------------------ */

function equitySeries(totals: Map<string, DayTotal>) {
  const daily = [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let cum = 0;
  return daily.map(([date, v]) => {
    cum += v.pnl;
    return { date, cum, day: v.pnl };
  });
}

function EquityCurveMini({ totals }: { totals: Map<string, DayTotal> }) {
  const pts = useMemo(() => equitySeries(totals), [totals]);
  if (pts.length < 2) return null;

  const W = 300;
  const H = 44;
  const vals = pts.map((p) => p.cum);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const range = max - min || 1;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / range) * H;
  const line = vals
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const end = vals[vals.length - 1]!;
  const stroke = end >= 0 ? "var(--color-profit)" : "var(--color-loss)";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-16 w-full"
      role="img"
      aria-label={`Cumulative net P&L, ending ${fmtMoney(end)}`}
    >
      <defs>
        <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        x1="0"
        y1={y(0)}
        x2={W}
        y2={y(0)}
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="0.5"
        className="text-muted-foreground"
      />
      <path d={area} fill="url(#equity-fill)" />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.25"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const BENCH_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];
const AUTO_INDEXES = ["SPY", "QQQ", "NASDAQ", "DOW", "RUSSELL"];

function EquityCurveFull({ totals }: { totals: Map<string, DayTotal> }) {
  const benchmarks = useBenchmarks();
  const [hidden, setHidden] = useState<string[]>([]);
  const [fetching, setFetching] = useState<string | null>(null);
  const principal = usePrincipal();
  const inFlight = useRef(false);

  const series = useMemo(() => equitySeries(totals), [totals]);
  const firstDate = series[0]?.date ?? "";
  const lastDate = series.at(-1)?.date ?? firstDate;

  const allNames = [...new Set([...AUTO_INDEXES, ...Object.keys(benchmarks)])];
  const active = allNames.filter((n) => (benchmarks[n]?.length ?? 0) > 1 && !hidden.includes(n));

  async function pull(name: string, silent = false) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setFetching(name);
    try {
      const pts = await fetchIndexHistory({
        data: { symbol: YAHOO_SYMBOLS[name]!, start: firstDate, end: lastDate },
      });
      if (pts.length < 2) throw new Error("no data returned");
      setBenchmark(name, pts);
      if (!silent) toast.success(`${name} · ${pts.length} days from Yahoo`);
      return true;
    } catch (err) {
      if (!silent) {
        toast.error(`Couldn't fetch ${name}`, {
          description:
            err instanceof Error
              ? err.message
              : "Needs the app served by a server (not a static host).",
        });
      }
      return false;
    } finally {
      inFlight.current = false;
      setFetching(null);
    }
  }

  useEffect(() => {
    if (!firstDate) return;
    let cancelled = false;
    (async () => {
      for (const name of AUTO_INDEXES) {
        if (cancelled) return;
        const cached = benchmarks[name];
        if (cached && cached.length > 1 && (cached.at(-1)?.date ?? "") >= lastDate) continue;
        await pull(name, true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDate, lastDate]);

  const rows = useMemo(() => {
    const bases: Record<string, number> = {};
    for (const n of active) {
      const b = benchmarks[n]!;
      bases[n] = (b.find((p) => p.date >= firstDate) ?? b[0])?.close ?? 0;
    }
    return series.map((s) => {
      const row: { label: string; cum: number; day: number; [k: string]: number | string } = {
        label: prettyDate(s.date).replace(/,\s*\d{4}$/, ""),
        cum: Math.round(s.cum),
        day: Math.round(s.day),
        You: principal > 0 ? Number(((s.cum / principal) * 100).toFixed(2)) : 0,
      };
      for (const n of active) {
        const b = benchmarks[n]!;
        let c: BenchmarkPoint | undefined;
        for (const p of b) {
          if (p.date <= s.date) c = p;
          else break;
        }
        if (c && bases[n]) row[n] = Number((((c.close - bases[n]!) / bases[n]!) * 100).toFixed(2));
      }
      return row;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, benchmarks, hidden.join(","), firstDate, principal]);

  const end = rows.at(-1)?.cum ?? 0;
  const stroke = end >= 0 ? "var(--color-profit)" : "var(--color-loss)";
  const youPct = principal > 0 ? (end / principal) * 100 : 0;

  const endLabel =
    (fill: string, fmt: (v: number) => string) =>
    (p: {
      x?: string | number | undefined;
      y?: string | number | undefined;
      value?: string | number | undefined;
      index?: number | undefined;
    }) => {
      const x = Number(p.x);
      const y = Number(p.y);
      if (
        p.index !== rows.length - 1 ||
        p.value == null ||
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ) {
        return null;
      }
      return (
        <text x={x + 5} y={y} fill={fill} fontSize={10} fontWeight={700} dominantBaseline="central">
          {fmt(Number(p.value))}
        </text>
      );
    };

  return (
    <div className="text-muted-foreground">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {principal > 0 && (
          <span
            className="flex items-center gap-1 rounded-md border border-transparent bg-secondary px-1.5 py-0.5 text-[11px] text-foreground"
            title={`${fmtMoney(end)} on $${principal.toLocaleString()} principal`}
          >
            <span className="size-1.5 rounded-full" style={{ background: stroke }} />
            You
            <span
              className={cn(
                "font-semibold tabular-nums",
                youPct >= 0 ? "text-profit" : "text-loss",
              )}
            >
              {youPct >= 0 ? "+" : ""}
              {youPct.toFixed(1)}%
            </span>
          </span>
        )}
        <span className="text-[10px] uppercase tracking-wider">vs</span>
        {allNames.map((name) => {
          const has = (benchmarks[name]?.length ?? 0) > 1;
          const on = has && !hidden.includes(name);
          const finalPct = on ? (rows.at(-1)?.[name] as number | undefined) : undefined;
          const color = BENCH_COLORS[active.indexOf(name) % BENCH_COLORS.length] ?? undefined;
          return (
            <span
              key={name}
              className={cn(
                "flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]",
                on ? "border-transparent bg-secondary text-foreground" : "border-border",
              )}
            >
              <button
                onClick={() => {
                  if (!has) void pull(name);
                  else
                    setHidden((h) =>
                      h.includes(name) ? h.filter((x) => x !== name) : [...h, name],
                    );
                }}
                className="flex items-center gap-1"
              >
                {on && color ? (
                  <span className="size-1.5 rounded-full" style={{ background: color }} />
                ) : (
                  <span className="text-muted-foreground">
                    {fetching === name ? "…" : has ? "" : "+"}
                  </span>
                )}
                {name}
                {typeof finalPct === "number" && (
                  <span className="font-semibold tabular-nums">
                    {finalPct > 0 ? "+" : ""}
                    {finalPct.toFixed(1)}%
                  </span>
                )}
              </button>
              {has && (
                <button
                  onClick={() => {
                    removeBenchmark(name);
                    setHidden((h) => h.filter((x) => x !== name));
                  }}
                  title={`Remove ${name}`}
                  className="text-muted-foreground hover:text-loss"
                >
                  <X className="size-3" />
                </button>
              )}
            </span>
          );
        })}
      </div>

      <div
        className="relative h-[42vh] w-full text-muted-foreground [&_.recharts-area-curve]:[filter:drop-shadow(0_0_5px_var(--glow))]"
        style={{ ["--glow" as string]: stroke }}
      >
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 8, right: 54, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="equity-full-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="currentColor" strokeOpacity={0.1} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "currentColor" }}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
            />
            <YAxis
              yAxisId="pnl"
              width={56}
              tick={{ fontSize: 10, fill: "currentColor" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => fmtMoneyShort(v)}
            />
            {(active.length > 0 || principal > 0) && (
              <YAxis
                yAxisId="pct"
                orientation="right"
                width={40}
                tick={{ fontSize: 10, fill: "currentColor" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}%`}
              />
            )}
            <ReferenceLine yAxisId="pnl" y={0} stroke="currentColor" strokeOpacity={0.3} />
            <Tooltip
              cursor={{ stroke: "currentColor", strokeOpacity: 0.3 }}
              contentStyle={{
                background: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--color-muted-foreground)" }}
              formatter={(v: number, key: string) =>
                key === "cum"
                  ? [fmtMoney(v), "Cumulative P&L"]
                  : [`${v > 0 ? "+" : ""}${v}%`, key === "You" ? "You" : key]
              }
            />
            <Area
              yAxisId="pnl"
              type="monotone"
              dataKey="cum"
              stroke={stroke}
              strokeWidth={2}
              fill="url(#equity-full-fill)"
            />
            {principal > 0 && (
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="You"
                stroke={stroke}
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
              >
                <LabelList
                  dataKey="You"
                  content={endLabel(stroke, (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`)}
                />
              </Line>
            )}
            {active.map((name, i) => {
              const color = BENCH_COLORS[i % BENCH_COLORS.length]!;
              return (
                <Line
                  key={name}
                  yAxisId="pct"
                  type="monotone"
                  dataKey={name}
                  stroke={color}
                  strokeWidth={1.5}
                  dot={false}
                >
                  <LabelList
                    dataKey={name}
                    content={endLabel(color, (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`)}
                  />
                </Line>
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-center text-[11px]">
        Return on{" "}
        <span className="inline-flex items-center">
          $
          <input
            type="number"
            min={0}
            step={1000}
            defaultValue={principal || ""}
            onChange={(e) => setPrincipal(Math.max(0, Number(e.target.value) || 0))}
            className="w-24 border-b border-border bg-transparent text-center font-semibold text-foreground outline-none focus:border-foreground"
          />
        </span>{" "}
        principal ={" "}
        <span className={cn("font-bold", youPct >= 0 ? "text-profit" : "text-loss")}>
          {youPct >= 0 ? "+" : ""}
          {youPct.toFixed(2)}%
        </span>
        . Dashed line = your return %; solid lines = the indexes, both rebased from day one.
      </p>
    </div>
  );
}

/** One widget, two views: the equity curve or the per-ticker P&L breakdown. */
export function MarketWidget() {
  const [tab, setTab] = useState<"equity" | "tickers">("equity");

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex shrink-0 items-center gap-0.5 self-start rounded-lg bg-secondary/50 p-0.5">
        {(
          [
            ["equity", "Equity curve"],
            ["tickers", "Ticker P&L"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              tab === key
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "equity" ? <EquityPane /> : <TickerBreakdown />}
      </div>
    </div>
  );
}

function EquityPane() {
  const { data, totals } = useDash();
  const [open, setOpen] = useState(false);
  const net = useMemo(() => [...totals.values()].reduce((s, v) => s + v.pnl, 0), [totals]);

  if (!data) return <NeedsData>Import a statement to plot the equity curve.</NeedsData>;

  return (
    <div className="flex h-full flex-col">
      <button
        onClick={() => setOpen(true)}
        className="block w-full rounded-md text-left transition-colors hover:bg-secondary/30"
        title="Open the full daily equity curve"
      >
        <p className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
          Equity curve <Maximize2 className="size-2.5" />
        </p>
        <EquityCurveMini totals={totals} />
      </button>
      <p className="mt-1 text-xs text-muted-foreground">
        Net{" "}
        <span className={cn("font-semibold", net >= 0 ? "text-profit" : "text-loss")}>
          {fmtMoney(net)}
        </span>{" "}
        · click to expand vs. the indexes
      </p>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerTitle className="px-5 pb-1 pt-3 text-sm font-semibold">
            Equity curve —{" "}
            <span className={net >= 0 ? "text-profit" : "text-loss"}>{fmtMoney(net)}</span> net
          </DrawerTitle>
          <div className="px-3 pb-6 pt-1 sm:px-5">
            <EquityCurveFull totals={totals} />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  All-time metrics                                                   *
 * ------------------------------------------------------------------ */

function gradeChip(grade: string) {
  const l = grade[0];
  if (l === "A" || l === "B") return "bg-profit/20 text-profit";
  if (l === "C") return "bg-secondary text-foreground";
  return "bg-loss/20 text-loss";
}

export function MetricsGrid() {
  const { data } = useDash();
  const a = useMemo(() => (data ? analyze(data) : null), [data]);

  if (!data || !a) return <NeedsData>Import a statement to compute metrics.</NeedsData>;
  const m = a.m;
  const pf = m.profitFactor === Infinity ? "∞" : m.profitFactor.toFixed(2);
  const po = m.payoff === Infinity ? "∞" : m.payoff.toFixed(2);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Metrics · all-time
        </h3>
        <Link
          to="/blog"
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <span className={cn("rounded px-1 py-0.5 font-bold", gradeChip(a.grade))}>{a.grade}</span>
          Full review →
        </Link>
      </div>
      <div className="mt-2 grid flex-1 content-start grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
        <Stat label="Net P&L" value={fmtMoneyShort(m.net)} tone={m.net} />
        <Stat label="Trades" value={String(m.tradeCount)} />
        <Stat label="Win rate" value={`${Math.round(m.winRate * 100)}%`} />
        <Stat label="Payoff" value={`${po}×`} tone={m.payoff >= 1 ? 1 : -1} />
        <Stat label="Profit factor" value={pf} tone={m.profitFactor >= 1 ? 1 : -1} />
        <Stat label="Expectancy" value={fmtMoneyShort(m.expectancy)} tone={m.expectancy} />
        <Stat label="Max drawdown" value={fmtMoneyShort(-m.maxDrawdown)} tone={-1} />
        <Stat label="Commissions" value={`-$${m.fees.toFixed(2)}`} />
        <Stat
          label="Green days"
          value={`${Math.round(m.dayWinRate * 100)}%`}
          hint="Share of all trading days that closed positive"
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Ticker P&L                                                         *
 * ------------------------------------------------------------------ */

type SortKey = "pnl" | "name";
type SortDir = "asc" | "desc";
const SORTS: { key: SortKey; label: string; defaultDir: SortDir }[] = [
  { key: "pnl", label: "P&L", defaultDir: "desc" },
  { key: "name", label: "Name", defaultDir: "asc" },
];

function groupVolume(g: SymbolGroup) {
  return g.rows.reduce((s, r) => s + r.qty, 0);
}
function groupFirstDay(g: SymbolGroup): string | undefined {
  return [...new Set(g.rows.flatMap((r) => r.days))].sort()[0];
}

export function TickerBreakdown() {
  const { data, openDetail } = useDash();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("pnl");
  const [dir, setDir] = useState<SortDir>("desc");
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const pickSort = (s: (typeof SORTS)[number]) => {
    if (s.key === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(s.key);
      setDir(s.defaultDir);
    }
  };
  const toggle = (symbol: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });

  const groups = useMemo(() => (data ? symbolGroups(data) : []), [data]);

  const visible = useMemo(() => {
    const q = query.trim().toUpperCase();
    const filtered = q ? groups.filter((g) => g.symbol.includes(q)) : groups;
    const sorted = [...filtered];
    if (sort === "name") sorted.sort((a, b) => a.symbol.localeCompare(b.symbol));
    else sorted.sort((a, b) => a.pnl - b.pnl);
    if (dir === "desc") sorted.reverse();
    return sorted;
  }, [groups, query, sort, dir]);

  const maxAbs = Math.max(1, ...visible.map((g) => Math.abs(g.pnl)));

  if (!data || groups.length === 0) {
    return <NeedsData>Import a statement to see per-ticker P&L.</NeedsData>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg bg-secondary/50 px-2.5 py-1.5">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter symbols…"
            className="w-28 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-secondary/50 p-1">
          {SORTS.map((s) => {
            const active = sort === s.key;
            return (
              <button
                key={s.key}
                onClick={() => pickSort(s)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
                {active &&
                  (dir === "asc" ? (
                    <ArrowUp className="size-3" />
                  ) : (
                    <ArrowDown className="size-3" />
                  ))}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 min-h-0 flex-1 divide-y divide-border overflow-auto rounded-lg bg-secondary/20">
        {visible.map((g) => {
          const isOpen = open.has(g.symbol);
          const firstDay = groupFirstDay(g);
          return (
            <div key={g.symbol}>
              <button
                onClick={() => toggle(g.symbol)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-secondary/30"
              >
                <ChevronRight
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-90",
                  )}
                />
                <span className="w-14 shrink-0 text-sm font-semibold">{g.symbol}</span>
                <span className="relative h-6 flex-1">
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 flex items-center justify-end rounded pr-2",
                      g.pnl > 0 && "bg-profit",
                      g.pnl < 0 && "bg-loss",
                      g.pnl === 0 && "bg-secondary",
                    )}
                    style={{ width: `${Math.max((Math.abs(g.pnl) / maxAbs) * 100, 16)}%` }}
                  >
                    <span className="whitespace-nowrap text-xs font-bold tabular-nums text-background">
                      {fmtMoney(g.pnl)}
                    </span>
                  </span>
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-border bg-secondary/20 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {groupVolume(g).toLocaleString()} contracts/shares closed
                      {g.fees > 0 ? ` · net of $${g.fees.toFixed(2)} commissions` : ""}
                    </p>
                    {firstDay && (
                      <button
                        onClick={() => openDetail(firstDay)}
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        Open day →
                      </button>
                    )}
                  </div>
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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Journal review                                                     *
 * ------------------------------------------------------------------ */

const toneText: Record<PostTone, string> = {
  good: "text-profit",
  bad: "text-loss",
  neutral: "text-muted-foreground",
};
const toneDot: Record<PostTone, string> = {
  good: "bg-profit",
  bad: "bg-loss",
  neutral: "bg-muted-foreground",
};

function gradeClass(grade: string) {
  const letter = grade[0];
  if (letter === "A" || letter === "B") return "bg-profit/20 text-profit";
  if (letter === "C") return "bg-secondary text-foreground";
  return "bg-loss/20 text-loss";
}

export function JournalReview() {
  const { data } = useDash();
  const coach = useCoachReview(data);
  const heuristicPosts = useMemo(() => (data ? journal(data) : []), [data]);

  if (heuristicPosts.length === 0) {
    return (
      <NeedsData>Import a statement (or load the demo) and the review writes itself.</NeedsData>
    );
  }

  const reviewDate = heuristicPosts.find((p) => p.id === "review")?.date ?? heuristicPosts[0]!.date;

  // When Claude has weighed in, its review replaces the heuristic one at the top;
  // otherwise the heuristic review stays and we surface why (loading / no key).
  const posts: Post[] =
    coach.status === "ready"
      ? [
          {
            id: "claude-review",
            date: reviewDate,
            title: "Coach's review",
            grade: coach.review.grade,
            score: coach.review.score,
            summary: coach.review.summary,
            sections: coach.review.sections,
          },
          ...heuristicPosts.filter((p) => p.id !== "review"),
        ]
      : heuristicPosts;

  return (
    <div className="h-full space-y-4 overflow-auto">
      <CoachStatusLine coach={coach} />
      {posts.map((post) => (
        <PostCard key={post.id} post={post} byClaude={post.id === "claude-review"} />
      ))}
    </div>
  );
}

function CoachStatusLine({ coach }: { coach: CoachState }) {
  if (coach.status === "loading") {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        Claude is reading your trades…
      </p>
    );
  }
  if (coach.status === "no-key") {
    return (
      <p className="rounded-lg bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground">
        Set <code className="text-foreground">ANTHROPIC_API_KEY</code> on the server for a
        Claude-written review. Showing the built-in one.
      </p>
    );
  }
  if (coach.status === "error") {
    return (
      <p className="rounded-lg bg-loss/10 px-3 py-2 text-[11px] text-loss">
        Claude review failed: {coach.message}. Showing the built-in one.
      </p>
    );
  }
  return null;
}

function PostCard({ post, byClaude = false }: { post: Post; byClaude?: boolean }) {
  return (
    <article
      className={cn(
        "rounded-xl p-4",
        byClaude ? "bg-primary/5 ring-1 ring-primary/20" : "bg-secondary/20",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
            {post.title}
            {byClaude && (
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                ✦ Claude
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {prettyDate(post.date)}
          </p>
        </div>
        {post.grade && (
          <div className="flex flex-col items-center">
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-lg text-base font-bold",
                gradeClass(post.grade),
              )}
            >
              {post.grade}
            </span>
            {post.score !== undefined && (
              <span className="mt-1 text-[10px] text-muted-foreground">{post.score}/100</span>
            )}
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{post.summary}</p>

      <div className="mt-3 space-y-3">
        {post.sections.map((section, i) => (
          <div key={i}>
            <h3
              className={cn(
                "text-[11px] font-semibold uppercase tracking-wider",
                toneText[section.tone],
              )}
            >
              {section.heading}
            </h3>
            <ul className="mt-1.5 space-y-1">
              {section.items.map((item, j) => (
                <li key={j} className="flex gap-2 text-xs">
                  <span
                    className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", toneDot[section.tone])}
                    aria-hidden
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ *
 *  Empty state                                                        *
 * ------------------------------------------------------------------ */

export function ImportDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);

  function loadDemo() {
    loadDemoFiles({ name: DEMO_FILE_NAME, fills: demoFills(), official: new Map() });
    toast.success("Loaded demo data", {
      description: "A sample of stock and options trades across two months. Clear it any time.",
    });
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        multiple
        className="hidden"
        onChange={(e) => {
          void importStatements(e.target.files);
          e.target.value = "";
        }}
      />
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void importStatements(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className="mt-4 cursor-pointer rounded-2xl border border-dashed border-border p-16 text-center transition-colors hover:border-primary/60 sm:p-20"
      >
        <Upload className="mx-auto size-8 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold">Drop your CSVs here</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Built and tested against Thinkorswim / Schwab &ldquo;Account Statement&rdquo; exports.
          Drop as many files as you like — they merge. Preamble rows, currency symbols and odd date
          formats are handled for you.
        </p>
        <div className="mt-6">
          <Button
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              loadDemo();
            }}
          >
            <Sparkles /> Load demo data
          </Button>
        </div>
      </div>
    </div>
  );
}
