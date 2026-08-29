import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  getCommissions,
  setCommissions,
  setDataset,
  useCommissions,
  useDataset,
} from "@/lib/pnlStore";
import { demoDataset } from "@/lib/demoData";
import { KindBadge, Stat, TrendArrow } from "@/components/pnl/shared";
import {
  buildDataset,
  dailyTotals,
  dayRows,
  fmtMoney,
  fmtMoneyShort,
  parseStatement,
  instrumentKind,
  type Dataset,
  type Fill,
  type InstrumentKind,
} from "@/lib/pnl";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

type DayTotal = { pnl: number; grossPnl: number; fees: number; trades: number };

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
  const comm = useCommissions();
  const isMobile = useIsMobile();
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const today = todayKey();

  // Jump to a requested day (from /tickers) or the latest day once data loads.
  useEffect(() => {
    if (!data || selected) return;
    const target =
      initialDay && data.fills.some((f) => f.date === initialDay)
        ? initialDay
        : data.fills[data.fills.length - 1]?.date;
    if (!target) return;
    const [y, m] = target.split("-").map(Number);
    setCursor(new Date(y!, m! - 1, 1));
    setSelected(target);
  }, [data, selected, initialDay]);

  function jumpTo(dateStr: string) {
    const [y, m] = dateStr.split("-").map(Number);
    setCursor(new Date(y!, m! - 1, 1));
    setSelected(dateStr);
  }

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

    if (next.fills.length === (data?.fills.length ?? 0)) {
      toast.error("No trades found in that file", {
        description: "Expecting a broker Account Statement export (Thinkorswim / Schwab).",
      });
      return;
    }

    setDataset(next);
    toast.success(`Imported ${next.fills.length - (data?.fills.length ?? 0)} new fills`, {
      description: `${next.closed.length} closed trades matched · ${next.openPositions.length} still open.`,
    });
    const last = next.fills[next.fills.length - 1];
    if (last) jumpTo(last.date);
  }

  function loadDemo() {
    const d = demoDataset();
    setDataset(d);
    const last = d.fills[d.fills.length - 1];
    if (last) jumpTo(last.date);
    toast.success("Loaded demo data", {
      description: "A sample of stock and options trades across two months. Clear it any time.",
    });
  }

  function clearAll() {
    setDataset(null);
    setSelected(null);
    toast("Cleared all imported data");
  }

  const totals = useMemo<Map<string, DayTotal>>(
    () => (data ? dailyTotals(data) : new Map()),
    [data],
  );

  const monthDays = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1).getDay();
    const count = new Date(y, m + 1, 0).getDate();
    const cells: (string | null)[] = Array.from({ length: first }, () => null);
    for (let d = 1; d <= count; d++) cells.push(iso(y, m, d));
    while (cells.length % 7) cells.push(null);
    const weeks: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [cursor]);

  const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
  const isCurrentMonth = today.startsWith(monthKey);

  const summary = useMemo(() => {
    if (!data) return null;
    const inMonth = [...totals.entries()].filter(([d]) => d.startsWith(monthKey));
    const pnl = inMonth.reduce((s, [, v]) => s + v.pnl, 0);
    const fees = inMonth.reduce((s, [, v]) => s + v.fees, 0);
    const wins = inMonth.filter(([, v]) => v.pnl > 0).length;
    const trades = inMonth.reduce((s, [, v]) => s + v.trades, 0);
    const contracts = data.closed
      .filter((t) => t.date.startsWith(monthKey))
      .reduce((s, t) => s + Math.abs(t.qty), 0);
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
      days: inMonth.length,
      winRate: inMonth.length ? Math.round((wins / inMonth.length) * 100) : 0,
      fees,
      best: best?.[1].pnl ?? 0,
      worst: worst?.[1].pnl ?? 0,
      avgPerTrade: trades ? pnl / trades : 0,
      avgPerDay: inMonth.length ? pnl / inMonth.length : 0,
      avgPerContract: contracts ? pnl / contracts : 0,
    };
  }, [data, totals, monthKey]);

  const allTime = useMemo(() => {
    if (!data) return null;
    const dates = [...totals.keys()].sort();
    const values = [...totals.values()];
    return {
      pnl: values.reduce((s, v) => s + v.pnl, 0),
      trades: values.reduce((s, v) => s + v.trades, 0),
      days: dates.length,
      since: dates[0] ?? null,
    };
  }, [data, totals]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <img
            src="/aum.webp"
            alt="Aum — auspicious symbol"
            title="ॐ — for luck"
            className="mt-1 size-10 shrink-0 select-none"
            style={{
              filter:
                "invert(78%) sepia(48%) saturate(680%) hue-rotate(1deg) brightness(94%) contrast(92%)",
            }}
          />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">PnL Calendar</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Import a broker CSV export — columns are matched automatically.
            </p>
            {allTime && (
              <p className="mt-2 text-xs text-muted-foreground">
                All-time{" "}
                <span
                  className={cn(
                    "font-semibold",
                    allTime.pnl > 0 && "text-profit",
                    allTime.pnl < 0 && "text-loss",
                  )}
                >
                  {fmtMoney(allTime.pnl)}
                </span>{" "}
                net · {allTime.trades} trades · {allTime.days} trading days
                {allTime.since ? ` · since ${prettyDate(allTime.since)}` : ""}
              </p>
            )}
          </div>
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
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="icon" title="Commission settings">
                <Settings2 />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto max-w-[90vw]">
              <p className="text-xs font-medium tracking-wider text-muted-foreground">
                BROKER COMMISSIONS
                <span className="mt-1 block max-w-xs text-[11px] font-normal normal-case tracking-normal">
                  Used when the statement has no commission column.
                </span>
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
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
            </PopoverContent>
          </Popover>
          {data && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="secondary">
                  <Trash2 /> Clear
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all imported data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Every fill is removed from this browser. Your CSV files are untouched, but
                    you&apos;ll need to re-import them to see the calendar again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction onClick={clearAll}>Clear everything</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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

      {!data ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void ingest(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className="mt-8 cursor-pointer rounded-2xl border border-dashed border-border p-16 text-center transition-colors hover:border-primary/60 sm:p-20"
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
          <div className="mt-8 flex flex-col items-center gap-2">
            <div className="flex items-center gap-4">
              <Button
                variant="secondary"
                size="icon"
                aria-label="Previous month"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              >
                <ChevronLeft />
              </Button>
              <h2 className="w-48 text-center text-xl font-semibold sm:w-56">
                {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </h2>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Next month"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              >
                <ChevronRight />
              </Button>
            </div>
            {!isCurrentMonth && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  setCursor(new Date());
                  if (totals.has(today)) setSelected(today);
                }}
              >
                <CalendarClock /> This month
              </Button>
            )}
          </div>

          {summary && (
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat label="Total P&L" value={fmtMoneyShort(summary.pnl)} tone={summary.pnl} />
              <Stat label="Commissions" value={`-$${summary.fees.toFixed(2)}`} />
              <Stat
                label="Green days"
                value={`${summary.winRate}%`}
                hint="Share of trading days this month that closed positive"
              />
              <Stat label="Best day" value={fmtMoneyShort(summary.best)} tone={summary.best} />
              <Stat label="Worst day" value={fmtMoneyShort(summary.worst)} tone={summary.worst} />
              <Stat
                label="Avg P&L / trade"
                value={fmtMoney(summary.avgPerTrade)}
                tone={summary.avgPerTrade}
              />
              <Stat
                label="Avg P&L / day"
                value={fmtMoney(summary.avgPerDay)}
                tone={summary.avgPerDay}
              />
              <Stat
                label="Avg P&L / contract"
                value={fmtMoney(summary.avgPerContract)}
                tone={summary.avgPerContract}
                hint="Month P&L ÷ contracts and shares closed this month"
              />
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="rounded-2xl bg-card p-3 sm:p-4">
              <div className="flex gap-2 pb-2">
                <div className="grid flex-1 grid-cols-7 gap-2 text-center text-xs font-medium tracking-wider text-muted-foreground">
                  {WEEKDAYS.map((d) => (
                    <div key={d}>{d}</div>
                  ))}
                </div>
                <div className="hidden w-20 shrink-0 text-center text-xs font-medium tracking-wider text-muted-foreground md:block">
                  WEEK
                </div>
              </div>

              <div className="space-y-2">
                {monthDays.map((week, wi) => {
                  const weekDays = week.filter((d): d is string => !!d);
                  const weekHasData = weekDays.some((d) => totals.has(d));
                  const weekPnl = weekDays.reduce((s, d) => s + (totals.get(d)?.pnl ?? 0), 0);
                  return (
                    <div key={wi} className="flex gap-2">
                      <div className="grid flex-1 grid-cols-7 gap-2">
                        {week.map((day, di) => {
                          if (!day) return <div key={`e${wi}-${di}`} />;
                          const t = totals.get(day);
                          const positive = (t?.pnl ?? 0) >= 0;
                          return (
                            <button
                              key={day}
                              onClick={() => setSelected(day)}
                              className={cn(
                                "flex h-20 flex-col rounded-xl border border-transparent bg-secondary/60 p-2 text-left text-sm transition-colors hover:border-primary/50 sm:h-24",
                                t && (positive ? "bg-profit-surface/70" : "bg-loss-surface/70"),
                                day === today && "ring-2 ring-primary/60",
                                selected === day && "border-foreground/70",
                              )}
                            >
                              <span className="text-xs text-muted-foreground">
                                {Number(day.slice(8))}
                              </span>
                              {t && (
                                <span className="mt-auto">
                                  <span className="flex items-center gap-0.5 font-semibold">
                                    <TrendArrow tone={t.pnl} className="size-3 shrink-0" />
                                    <span className="truncate">{fmtMoney(t.pnl)}</span>
                                  </span>
                                  <span className="block text-xs opacity-80">
                                    {t.trades} trade{t.trades === 1 ? "" : "s"}
                                  </span>
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <div className="hidden w-20 shrink-0 flex-col justify-center rounded-xl bg-secondary/40 p-2 text-right md:flex">
                        {weekHasData ? (
                          <>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Week
                            </span>
                            <span
                              className={cn(
                                "text-sm font-semibold",
                                weekPnl > 0 && "text-profit",
                                weekPnl < 0 && "text-loss",
                              )}
                            >
                              {fmtMoneyShort(weekPnl)}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <aside className="hidden rounded-2xl bg-card p-5 lg:block">
              {selected ? (
                <DayDetail data={data} selected={selected} totals={totals} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a day to see the tickers you played.
                </p>
              )}
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
      <h3 className="text-xs font-semibold tracking-wider text-muted-foreground">
        {prettyDate(selected).toUpperCase()}
      </h3>
      <p className="mt-1 flex items-center gap-1 text-2xl font-bold">
        <TrendArrow tone={dayPnl} className="size-5" />
        <span className={dayPnl >= 0 ? "text-profit" : "text-loss"}>{fmtMoney(dayPnl)}</span>
      </p>
      {(t?.fees ?? 0) > 0 && (
        <p className="text-xs text-muted-foreground">
          net of ${(t?.fees ?? 0).toFixed(2)} commissions (gross {fmtMoney(t?.grossPnl ?? 0)})
        </p>
      )}
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No trades on this day.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((r) => {
            const unit = r.kind === "stock" ? "shares" : "contracts";
            return (
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
        <div className="mt-6 border-t border-border pt-4">
          <h4 className="text-xs font-semibold tracking-wider text-muted-foreground">STILL OPEN</h4>
          <ul className="mt-2 space-y-2 text-sm">
            {data.openPositions.map((p) => {
              const kind = instrumentKind(p.label);
              const one = Math.abs(p.qty) === 1;
              const unit =
                kind === "stock" ? (one ? "share" : "shares") : one ? "contract" : "contracts";
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
