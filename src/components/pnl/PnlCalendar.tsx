import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { setDataset, useDataset } from "@/lib/pnlStore";
import { demoDataset } from "@/lib/demoData";
import { importStatements } from "@/lib/import";
import { KindBadge, Stat, TrendArrow } from "@/components/pnl/shared";
import {
  dailyTotals,
  dayRows,
  fmtMoney,
  fmtMoneyShort,
  instrumentKind,
  type Dataset,
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
  const isMobile = useIsMobile();
  const [cursor, setCursor] = useState(() => new Date());
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
    setDataset(demoDataset());
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

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col px-4 py-3 sm:px-6 lg:h-[calc(100dvh-3.5rem)] lg:overflow-hidden">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        multiple
        className="hidden"
        onChange={(e) => {
          void importStatements(e.target.files, data);
          e.target.value = "";
        }}
      />

      {!data ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void importStatements(e.dataTransfer.files, data);
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
          <div className="flex shrink-0 items-center justify-center gap-3">
            <Button
              variant="secondary"
              size="icon"
              className="size-8"
              aria-label="Previous month"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            >
              <ChevronLeft />
            </Button>
            <h2 className="w-44 text-center text-base font-semibold">
              {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h2>
            <Button
              variant="secondary"
              size="icon"
              className="size-8"
              aria-label="Next month"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            >
              <ChevronRight />
            </Button>
            {!isCurrentMonth && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-muted-foreground"
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
            <div className="mt-2 grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
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
                label="Avg / trade"
                value={fmtMoneyShort(summary.avgPerTrade)}
                tone={summary.avgPerTrade}
                hint="Month P&L ÷ closed trades"
              />
              <Stat
                label="Avg / day"
                value={fmtMoneyShort(summary.avgPerDay)}
                tone={summary.avgPerDay}
                hint="Month P&L ÷ trading days"
              />
              <Stat
                label="Avg / contract"
                value={fmtMoney(summary.avgPerContract)}
                tone={summary.avgPerContract}
                hint="Month P&L ÷ contracts and shares closed this month"
              />
            </div>
          )}

          <div className="mt-2 grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[1fr_340px]">
            <div className="flex flex-col overflow-hidden rounded-xl bg-card p-2 sm:p-3">
              <div className="grid shrink-0 grid-cols-7 gap-2 pb-1.5 text-center text-[11px] font-medium tracking-wider text-muted-foreground md:grid-cols-8">
                {WEEKDAYS.map((d) => (
                  <div key={d}>{d}</div>
                ))}
                <div className="hidden md:block">WEEK</div>
              </div>

              <div className="flex flex-col gap-2 lg:min-h-0 lg:flex-1">
                {monthDays.map((week, wi) => {
                  const weekDays = week.filter((d): d is string => !!d);
                  const weekHasData = weekDays.some((d) => totals.has(d));
                  const weekPnl = weekDays.reduce((s, d) => s + (totals.get(d)?.pnl ?? 0), 0);
                  return (
                    <div
                      key={wi}
                      className="grid grid-cols-7 gap-2 md:grid-cols-8 lg:min-h-0 lg:flex-1 lg:content-stretch"
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
                                <span className="block text-[10px]">
                                  {t.trades} trade{t.trades === 1 ? "" : "s"}
                                </span>
                              </span>
                            )}
                          </button>
                        );
                      })}
                      <div className="hidden h-16 flex-col justify-center rounded-lg bg-secondary/40 p-1.5 text-right sm:h-20 md:flex lg:h-full">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Week
                        </span>
                        {weekHasData ? (
                          <span
                            className={cn(
                              "text-xs font-semibold tabular-nums",
                              weekPnl > 0 && "text-profit",
                              weekPnl < 0 && "text-loss",
                            )}
                          >
                            {fmtMoneyShort(weekPnl)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
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
