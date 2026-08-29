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
    const trades = inMonth.reduce((s, [, v]) => s + v.trades, 0);
    const contracts = data.closed
      .filter((t) => t.date.startsWith(monthKey))
      .reduce((s, t) => s + Math.abs(t.qty), 0);
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
      avgPerTrade: trades ? pnl / trades : 0,
      avgPerDay: inMonth.length ? pnl / inMonth.length : 0,
      avgPerContract: contracts ? pnl / contracts : 0,
    };
  }, [data, totals, cursor]);

  const rows = useMemo(
    () => (data && selected ? dayRows(data, selected) : []),
    [data, selected],
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10">
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
              Drop in a broker CSV export — columns are matched automatically.
            </p>
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
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat label="Total P&L" value={fmtMoneyShort(summary.pnl)} tone={summary.pnl} />
              <Stat label="Commissions" value={`-$${summary.fees.toFixed(2)}`} />
              <Stat label="Win rate" value={`${summary.winRate}%`} />
              <Stat label="Best day" value={fmtMoneyShort(summary.best)} tone={summary.best} />
              <Stat label="Worst day" value={fmtMoneyShort(summary.worst)} tone={summary.worst} />
              <Stat label="Avg P&L / trade" value={fmtMoney(summary.avgPerTrade)} tone={summary.avgPerTrade} />
              <Stat label="Avg P&L / day" value={fmtMoney(summary.avgPerDay)} tone={summary.avgPerDay} />
              <Stat
                label="Avg P&L / contract"
                value={fmtMoney(summary.avgPerContract)}
                tone={summary.avgPerContract}
              />
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
