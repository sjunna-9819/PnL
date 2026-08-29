import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
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
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { loadDemoFiles, useDataset } from "@/lib/pnlStore";
import { DEMO_FILE_NAME, demoFills } from "@/lib/demoData";
import { importStatements } from "@/lib/import";
import { analyze } from "@/lib/blog";
import {
  removeBenchmark,
  setBenchmark,
  useBenchmarks,
  type BenchmarkPoint,
} from "@/lib/benchmarks";
import { fetchIndexHistory, YAHOO_SYMBOLS } from "@/lib/marketData";
import { KindBadge, Stat, TrendArrow } from "@/components/pnl/shared";
import {
  dailyTotals,
  dayRows,
  fmtMoney,
  fmtMoneyShort,
  instrumentKind,
  type DayTotal,
  type Dataset,
  type InstrumentKind,
} from "@/lib/pnl";

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

function todayKey() {
  const t = new Date();
  return iso(t.getFullYear(), t.getMonth(), t.getDate());
}

function prettyDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PnlCalendar({ initialDay }: { initialDay?: string | undefined }) {
  const data = useDataset();
  const isMobile = useIsMobile();
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<"month" | "year">("month");
  const [selected, setSelected] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const today = todayKey();

  const newestDate = data ? (data.fills[data.fills.length - 1]?.date ?? null) : null;
  const hasInitialDay = !!(initialDay && data?.fills.some((f) => f.date === initialDay));
  const initedRef = useRef(false);

  // On first data load jump to the requested day (from /tickers), and whenever a
  // later statement is imported jump to its newest day.
  useEffect(() => {
    if (!newestDate) return;
    const target = !initedRef.current && hasInitialDay ? initialDay! : newestDate;
    initedRef.current = true;
    const [y, m] = target.split("-").map(Number);
    setCursor(new Date(y!, m! - 1, 1));
    setSelected(target);
  }, [newestDate, initialDay, hasInitialDay]);

  function loadDemo() {
    loadDemoFiles({ name: DEMO_FILE_NAME, fills: demoFills(), official: new Map() });
    toast.success("Loaded demo data", {
      description: "A sample of stock and options trades across two months. Clear it any time.",
    });
  }

  const totals = useMemo<Map<string, DayTotal>>(
    () => (data ? dailyTotals(data) : new Map()),
    [data],
  );

  const monthDays = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const count = new Date(y, m + 1, 0).getDate();
    const firstDow = new Date(y, m, 1).getDay(); // 0=Sun … 6=Sat
    // leading blanks so the 1st lands in its Mon–Fri column (0 if it's a weekend)
    const lead = firstDow >= 1 && firstDow <= 5 ? firstDow - 1 : 0;
    const cells: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= count; d++) {
      const dow = new Date(y, m, d).getDay();
      if (dow === 0 || dow === 6) continue; // skip weekends
      cells.push(iso(y, m, d));
    }
    while (cells.length % 5) cells.push(null);
    const weeks: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 5) weeks.push(cells.slice(i, i + 5));
    return weeks;
  }, [cursor]);

  const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
  const yearKey = String(cursor.getFullYear());
  const period = view === "month" ? monthKey : yearKey;
  const isCurrentPeriod = today.startsWith(period);

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

  const summary = useMemo(() => {
    if (!data) return null;
    const inMonth = [...totals.entries()].filter(([d]) => d.startsWith(period));
    const pnl = inMonth.reduce((s, [, v]) => s + v.pnl, 0);
    const trades = inMonth.reduce((s, [, v]) => s + v.trades, 0);
    // Options and stock kept separate: contracts vs shares.
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

  return (
    <div className="flex w-full flex-col px-4 py-3 sm:px-6 lg:px-24 lg:h-[calc(100dvh-3.5rem)] lg:overflow-hidden">
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

      {!data ? (
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
            Drop as many files as you like — they merge. Preamble rows, currency symbols and odd
            date formats are handled for you.
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
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg bg-card p-0.5">
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

          {summary && (
            <div className="mt-2 grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
              <Stat label="Total P&L" value={fmtMoneyShort(summary.pnl)} tone={summary.pnl} />
              <Stat label="Best day" value={fmtMoneyShort(summary.best)} tone={summary.best} />
              <Stat label="Worst day" value={fmtMoneyShort(summary.worst)} tone={summary.worst} />
              <Stat
                label="Avg / trade"
                value={fmtMoneyShort(summary.avgPerTrade)}
                tone={summary.avgPerTrade}
                hint={`${view === "month" ? "Month" : "Year"} P&L ÷ closed trades`}
              />
              <Stat
                label="Avg / day"
                value={fmtMoneyShort(summary.avgPerDay)}
                tone={summary.avgPerDay}
                hint={`${view === "month" ? "Month" : "Year"} P&L ÷ trading days`}
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
          )}

          <div className="mt-2 grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[1fr_340px]">
            <div className="flex min-h-0 flex-col gap-3">
              <div className="flex flex-col overflow-hidden rounded-xl bg-card p-2 sm:p-3 lg:min-h-0 lg:flex-1">
                {view === "year" ? (
                  <YearHeatmap
                    cols={yearCols}
                    totals={totals}
                    today={today}
                    selected={selected}
                    onSelect={setSelected}
                  />
                ) : (
                  <>
                    <div className="grid shrink-0 grid-cols-5 gap-2 pb-1.5 text-center text-[11px] font-medium tracking-wider text-muted-foreground">
                      {WEEKDAYS.map((d) => (
                        <div key={d}>{d}</div>
                      ))}
                    </div>

                    <div className="flex flex-col gap-2 lg:min-h-0 lg:flex-1 lg:justify-center">
                      {monthDays.map((week, wi) => {
                        return (
                          <div
                            key={wi}
                            className="grid grid-cols-5 gap-2 lg:min-h-0 lg:max-h-24 lg:flex-1 lg:content-stretch"
                          >
                            {week.map((day, di) => {
                              if (!day) return <div key={`e${wi}-${di}`} />;
                              const t = totals.get(day);
                              const positive = (t?.pnl ?? 0) >= 0;
                              return (
                                <button
                                  key={day}
                                  onClick={() => setSelected(day)}
                                  className={cn(
                                    "flex h-16 flex-col overflow-hidden rounded-lg border border-transparent bg-secondary/60 p-1.5 text-left transition-all hover:border-primary/50 sm:h-20 lg:h-full",
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
                                          <span className="text-muted-foreground">
                                            {t.breakeven}BE
                                          </span>
                                        )}
                                      </span>
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              <InsightsPanel data={data} totals={totals} />
            </div>

            {/* relative + absolute inner: the panel matches the calendar's height
                exactly and scrolls internally instead of stretching the row. */}
            <aside className="relative hidden lg:block">
              <div className="absolute inset-0 overflow-y-auto overscroll-contain rounded-xl bg-card p-3">
                {selected ? (
                  <DayDetail data={data} selected={selected} totals={totals} />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Select a day to see the tickers you played.
                  </p>
                )}
              </div>
            </aside>
          </div>

          <Drawer
            open={isMobile && !!selected}
            onOpenChange={(open) => {
              if (!open) setSelected(null);
            }}
          >
            <DrawerContent className="max-h-[85vh]">
              <DrawerTitle className="sr-only">Day detail</DrawerTitle>
              <div className="overflow-y-auto px-5 pb-8 pt-2">
                {selected && <DayDetail data={data} selected={selected} totals={totals} />}
              </div>
            </DrawerContent>
          </Drawer>
        </>
      )}
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
    <div className="flex min-h-0 flex-1 flex-col justify-center overflow-x-auto py-2">
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

function gradeChip(grade: string) {
  const l = grade[0];
  if (l === "A" || l === "B") return "bg-profit/20 text-profit";
  if (l === "C") return "bg-secondary text-foreground";
  return "bg-loss/20 text-loss";
}

/** Inline-SVG cumulative net-P&L curve (equity curve). */
function equitySeries(totals: Map<string, DayTotal>) {
  const daily = [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let cum = 0;
  return daily.map(([date, v]) => {
    cum += v.pnl;
    return { date, cum, day: v.pnl };
  });
}

function EquityCurve({ totals }: { totals: Map<string, DayTotal> }) {
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
      className="h-11 w-full"
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

/** Full daily equity chart + index comparison, shown in the slide-up drawer. */
function EquityCurveFull({ totals }: { totals: Map<string, DayTotal> }) {
  const benchmarks = useBenchmarks();
  const [shown, setShown] = useState<string[]>([]);
  const [chart, setChart] = useState<"line" | "bars">("line");
  const [fetching, setFetching] = useState<string | null>(null);
  const inFlight = useRef(false);

  const series = useMemo(() => equitySeries(totals), [totals]);
  const firstDate = series[0]?.date ?? "";
  const lastDate = series.at(-1)?.date ?? firstDate;

  const active = shown.filter((n) => (benchmarks[n]?.length ?? 0) > 1);

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
      setShown((s) => (s.includes(name) ? s : [...s, name]));
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

  // On open, pull the default indexes from Yahoo (uses the cache when fresh).
  useEffect(() => {
    if (!firstDate) return;
    let cancelled = false;
    (async () => {
      let ok = 0;
      let attempted = 0;
      for (const name of AUTO_INDEXES) {
        if (cancelled) return;
        const cached = benchmarks[name];
        if (cached && cached.length > 1 && (cached.at(-1)?.date ?? "") >= lastDate) {
          setShown((s) => (s.includes(name) ? s : [...s, name]));
          ok++;
          continue;
        }
        attempted++;
        if (await pull(name, true)) ok++;
      }
      if (!cancelled && attempted > 0 && ok === 0) {
        toast("Couldn't reach Yahoo — add an index with “+ CSV” instead");
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
  }, [series, benchmarks, shown.join(","), firstDate]);

  const end = rows.at(-1)?.cum ?? 0;
  const stroke = end >= 0 ? "var(--color-profit)" : "var(--color-loss)";

  // label only the last point of a series
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
        <div className="mr-1 flex items-center gap-0.5 rounded-md bg-secondary/60 p-0.5">
          {(["line", "bars"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setChart(c)}
              className={cn(
                "rounded px-2 py-0.5 text-[11px] font-medium capitalize transition-colors",
                chart === c
                  ? "bg-card text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <span className="text-[10px] uppercase tracking-wider">Compare vs</span>
        {Object.keys(benchmarks).map((name) => {
          const on = shown.includes(name);
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
                onClick={() =>
                  setShown((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]))
                }
                className="flex items-center gap-1"
              >
                {on && color && (
                  <span className="size-1.5 rounded-full" style={{ background: color }} />
                )}
                {name}
                {typeof finalPct === "number" && (
                  <span className="font-semibold tabular-nums">
                    {finalPct > 0 ? "+" : ""}
                    {finalPct.toFixed(1)}%
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  removeBenchmark(name);
                  setShown((s) => s.filter((x) => x !== name));
                }}
                title={`Remove ${name}`}
                className="text-muted-foreground hover:text-loss"
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}
        {AUTO_INDEXES.filter((n) => !benchmarks[n]).map((n) => (
          <button
            key={n}
            onClick={() => void pull(n)}
            disabled={!!fetching}
            className="rounded-md border border-border px-1.5 py-0.5 text-[11px] hover:text-foreground disabled:opacity-50"
          >
            {fetching === n ? "…" : `+ ${n}`}
          </button>
        ))}
      </div>

      <div
        className="h-[42vh] w-full text-muted-foreground [&_.recharts-area-curve]:[filter:drop-shadow(0_0_5px_var(--glow))]"
        style={{ ["--glow" as string]: stroke }}
      >
        <ResponsiveContainer>
          <ComposedChart
            data={rows}
            margin={{ top: 8, right: active.length ? 52 : 40, bottom: 0, left: 0 }}
          >
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
            {active.length > 0 && (
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
                  : key === "day"
                    ? [fmtMoney(v), "Day P&L"]
                    : [`${v > 0 ? "+" : ""}${v}%`, key]
              }
            />
            {chart === "line" ? (
              <Area
                yAxisId="pnl"
                type="monotone"
                dataKey="cum"
                stroke={stroke}
                strokeWidth={2}
                fill="url(#equity-full-fill)"
              >
                <LabelList dataKey="cum" content={endLabel(stroke, fmtMoneyShort)} />
              </Area>
            ) : (
              <Bar yAxisId="pnl" dataKey="day" radius={[2, 2, 0, 0]}>
                {rows.map((r, i) => (
                  <Cell key={i} fill={r.day >= 0 ? "var(--color-profit)" : "var(--color-loss)"} />
                ))}
              </Bar>
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
    </div>
  );
}

function InsightsPanel({ data, totals }: { data: Dataset; totals: Map<string, DayTotal> }) {
  const [curveOpen, setCurveOpen] = useState(false);
  const a = useMemo(() => analyze(data), [data]);
  const m = a.m;
  const pf = m.profitFactor === Infinity ? "∞" : m.profitFactor.toFixed(2);
  const po = m.payoff === Infinity ? "∞" : m.payoff.toFixed(2);
  return (
    <div className="shrink-0 rounded-xl bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Insights · all-time
        </h3>
        <Link
          to="/blog"
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <span className={cn("rounded px-1 py-0.5 font-bold", gradeChip(a.grade))}>{a.grade}</span>
          Full review →
        </Link>
      </div>
      <button
        onClick={() => setCurveOpen(true)}
        className="mt-1.5 block w-full rounded-md text-left transition-colors hover:bg-secondary/30"
        title="Open the full daily equity curve"
      >
        <p className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
          Equity curve <Maximize2 className="size-2.5" />
        </p>
        <EquityCurve totals={totals} />
      </button>

      <Drawer open={curveOpen} onOpenChange={setCurveOpen}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerTitle className="px-5 pb-1 pt-3 text-sm font-semibold">
            Equity curve —{" "}
            <span className={m.net >= 0 ? "text-profit" : "text-loss"}>{fmtMoney(m.net)}</span> net
          </DrawerTitle>
          <div className="px-3 pb-6 pt-1 sm:px-5">
            <EquityCurveFull totals={totals} />
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Your cumulative net P&amp;L (left, $) vs each index rebased to % from your first
              trading day (right). SPY / QQQ / Nasdaq pull from Yahoo automatically (needs the app
              served by a server — dev, <code>npm run preview</code>, or the Node server).
            </p>
          </div>
        </DrawerContent>
      </Drawer>

      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-9">
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

function DayDetail({
  data,
  selected,
  totals,
}: {
  data: Dataset;
  selected: string;
  totals: Map<string, DayTotal>;
}) {
  const rows = useMemo(() => dayRows(data, selected), [data, selected]);
  const t = totals.get(selected);
  const dayPnl = t?.pnl ?? 0;

  return (
    <>
      <h3 className="text-[10px] font-semibold tracking-wider text-muted-foreground">
        {prettyDate(selected).toUpperCase()}
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
