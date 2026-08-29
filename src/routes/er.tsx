import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { useDataset } from "@/lib/pnlStore";
import { symbolGroups } from "@/lib/pnl";
import { isDayFresh, setEarningsDay, useEarningsCalendar } from "@/lib/earnings";
import { fetchEarningsDay, type EarningsCompany } from "@/lib/marketData";

const title = "Earnings Calendar — Every Company Reporting, by Day";
const description =
  "A month calendar of every US company reporting earnings, with consensus EPS and market cap. Free data from Nasdaq.";

export const Route = createFileRoute("/er")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: EarningsCalendarPage,
});

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const todayKey = () => new Date().toISOString().slice(0, 10);

function prettyDay(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y!, m! - 1, day!).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtCap(n: number | null) {
  if (n == null) return "";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

const timeLabel: Record<EarningsCompany["time"], string> = {
  pre: "Before open",
  after: "After close",
  other: "Time TBD",
};

function EarningsCalendarPage() {
  const data = useDataset();
  const cal = useEarningsCalendar();

  const held = useMemo(() => new Set(data ? symbolGroups(data).map((g) => g.symbol) : []), [data]);

  const [cursor, setCursor] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string>(todayKey());

  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const monthKey = `${y}-${String(m + 1).padStart(2, "0")}`;

  const { weeks, weekdayDates } = useMemo(() => {
    const count = new Date(y, m + 1, 0).getDate();
    const firstDow = new Date(y, m, 1).getDay();
    const lead = firstDow >= 1 && firstDow <= 5 ? firstDow - 1 : 0;
    const cells: (string | null)[] = Array.from({ length: lead }, () => null);
    const dates: string[] = [];
    for (let d = 1; d <= count; d++) {
      const dow = new Date(y, m, d).getDay();
      if (dow === 0 || dow === 6) continue;
      const k = iso(y, m, d);
      cells.push(k);
      dates.push(k);
    }
    while (cells.length % 5) cells.push(null);
    const w: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 5) w.push(cells.slice(i, i + 5));
    return { weeks: w, weekdayDates: dates };
  }, [y, m]);

  const fetching = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // wait for any in-flight month to finish so we don't hammer Nasdaq
      while (fetching.current && !cancelled) await new Promise((r) => setTimeout(r, 120));
      if (cancelled) return;
      const todo = weekdayDates.filter((d) => !isDayFresh(d, cal[d]));
      if (todo.length === 0) return;
      fetching.current = true;
      setBusy(true);
      try {
        for (const d of todo) {
          if (cancelled) return;
          try {
            const companies = await fetchEarningsDay({ data: { date: d } });
            if (!cancelled) setEarningsDay(d, companies);
          } catch {
            /* skip this day; a later visit retries */
          }
        }
      } finally {
        fetching.current = false;
        setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey, weekdayDates.join(",")]);

  const today = todayKey();
  const sel = cal[selected];

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Earnings calendar</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every US company reporting, by day. Free data from Nasdaq.
              {busy && <span className="ml-2 text-xs">· loading {MONTHS[m]}…</span>}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCursor(new Date(y, m - 1, 1))}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="w-40 text-center text-sm font-semibold tabular-nums">
              {MONTHS[m]} {y}
            </span>
            <button
              onClick={() => setCursor(new Date(y, m + 1, 1))}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Next month"
            >
              <ChevronRight className="size-4" />
            </button>
            {monthKey !== today.slice(0, 7) && (
              <button
                onClick={() => {
                  const t = new Date();
                  setCursor(new Date(t.getFullYear(), t.getMonth(), 1));
                  setSelected(todayKey());
                }}
                className="ml-1 rounded-md bg-secondary px-2 py-1 text-xs font-medium hover:bg-secondary/70"
              >
                Today
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-5 gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-1">
              {d}
            </div>
          ))}
        </div>

        <div className="mt-1.5 space-y-1.5">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-5 gap-1.5">
              {week.map((day, di) => {
                if (!day) return <div key={di} className="rounded-lg bg-card/40" />;
                const entry = cal[day];
                const companies = entry?.companies ?? [];
                const yours = companies.filter((c) => held.has(c.symbol));
                const isToday = day === today;
                const isSel = day === selected;
                return (
                  <button
                    key={di}
                    onClick={() => setSelected(day)}
                    className={cn(
                      "flex min-h-[76px] flex-col rounded-lg border bg-card p-1.5 text-left transition-colors sm:min-h-[92px]",
                      isSel
                        ? "border-primary ring-1 ring-primary"
                        : "border-border hover:border-muted-foreground/40",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[11px] font-medium leading-none",
                        isToday
                          ? "flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {Number(day.slice(8))}
                    </span>
                    {companies.length > 0 && (
                      <>
                        <span className="mt-1 text-[10px] text-muted-foreground">
                          {companies.length} report{companies.length === 1 ? "" : "s"}
                        </span>
                        <span className="mt-0.5 flex flex-wrap gap-0.5">
                          {companies.slice(0, 3).map((c) => (
                            <span
                              key={c.symbol}
                              className={cn(
                                "rounded px-1 text-[9px] font-semibold leading-4",
                                held.has(c.symbol)
                                  ? "bg-primary/20 text-foreground"
                                  : "bg-secondary text-muted-foreground",
                              )}
                            >
                              {c.symbol}
                            </span>
                          ))}
                          {companies.length > 3 && (
                            <span className="text-[9px] leading-4 text-muted-foreground">
                              +{companies.length - 3}
                            </span>
                          )}
                        </span>
                      </>
                    )}
                    {yours.length > 0 && (
                      <span className="mt-auto pt-0.5 text-[9px] font-medium text-primary">
                        ● {yours.map((c) => c.symbol).join(" ")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <DayList date={selected} companies={sel?.companies ?? null} loading={busy} held={held} />
      </div>
    </main>
  );
}

function DayList({
  date,
  companies,
  loading,
  held,
}: {
  date: string;
  companies: EarningsCompany[] | null;
  loading: boolean;
  held: Set<string>;
}) {
  const groups: { key: EarningsCompany["time"]; rows: EarningsCompany[] }[] = (
    ["pre", "after", "other"] as const
  )
    .map((key) => ({ key, rows: (companies ?? []).filter((c) => c.time === key) }))
    .filter((g) => g.rows.length > 0);

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold">{prettyDay(date)}</h2>
      {companies == null ? (
        <p className="mt-3 rounded-xl bg-card px-4 py-3 text-sm text-muted-foreground">
          {loading ? "Loading…" : "No data for this day yet."}
        </p>
      ) : companies.length === 0 ? (
        <p className="mt-3 rounded-xl bg-card px-4 py-3 text-sm text-muted-foreground">
          Nothing scheduled to report.
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          {groups.map((g) => (
            <div key={g.key}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {timeLabel[g.key]} · {g.rows.length}
              </p>
              <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card">
                {g.rows.map((c) => (
                  <li key={c.symbol} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span
                      className={cn(
                        "w-16 shrink-0 font-semibold",
                        held.has(c.symbol) && "text-primary",
                      )}
                    >
                      {c.symbol}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground" title={c.name}>
                      {c.name}
                    </span>
                    {c.epsForecast != null && (
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        EPS est. {c.epsForecast.toFixed(2)}
                      </span>
                    )}
                    <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                      {fmtCap(c.marketCap)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
