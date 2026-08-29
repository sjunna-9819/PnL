import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { useDataset } from "@/lib/pnlStore";
import { symbolGroups } from "@/lib/pnl";
import { EARNINGS_TTL_MS, setEarnings, useEarnings } from "@/lib/earnings";
import { fetchEarnings } from "@/lib/marketData";

const title = "Earnings Calendar — Report Days for Every Ticker You Trade";
const description =
  "One calendar of earnings report dates for every ticker in your imported statements, upcoming and recent. Pulled from Yahoo Finance.";

export const Route = createFileRoute("/er")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: EarningsCalendar,
});

const DAY = 86_400_000;
const todayISO = () => new Date().toISOString().slice(0, 10);

function fmtDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y!, m! - 1, day!).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function relDays(d: string) {
  const n = Math.round((Date.parse(`${d}T00:00:00`) - Date.parse(`${todayISO()}T00:00:00`)) / DAY);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

type Item = { symbol: string; estimate: boolean };
type Row = { date: string; items: Item[] };

function groupByDate(list: { date: string; symbol: string; estimate: boolean }[]): Row[] {
  const m = new Map<string, Item[]>();
  for (const e of list) {
    const arr = m.get(e.date) ?? [];
    arr.push({ symbol: e.symbol, estimate: e.estimate });
    m.set(e.date, arr);
  }
  return [...m.entries()].map(([date, items]) => ({
    date,
    items: items.sort((a, b) => a.symbol.localeCompare(b.symbol)),
  }));
}

function EarningsCalendar() {
  const data = useDataset();
  const cache = useEarnings();

  const symbols = useMemo(() => (data ? symbolGroups(data).map((g) => g.symbol) : []), [data]);
  const symbolsKey = symbols.join(",");

  const [loading, setLoading] = useState<string[]>([]);

  useEffect(() => {
    if (symbols.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const sym of symbols) {
        if (cancelled) return;
        const c = cache[sym];
        if (c && Date.now() - c.fetchedAt < EARNINGS_TTL_MS) continue;
        setLoading((l) => (l.includes(sym) ? l : [...l, sym]));
        try {
          const info = await fetchEarnings({ data: { symbol: sym } });
          if (!cancelled) setEarnings(info);
        } catch {
          /* leave uncached; a later visit retries */
        }
        setLoading((l) => l.filter((s) => s !== sym));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  const { upcoming, past, noData, pending } = useMemo(() => {
    const flat: { date: string; symbol: string; estimate: boolean }[] = [];
    const noData: string[] = [];
    let pending = 0;
    for (const sym of symbols) {
      const e = cache[sym];
      if (!e) {
        pending++;
        continue;
      }
      if (!e.nextDate && e.history.length === 0) {
        noData.push(sym);
        continue;
      }
      if (e.nextDate) flat.push({ date: e.nextDate, symbol: sym, estimate: e.nextIsEstimate });
      for (const h of e.history) flat.push({ date: h.date, symbol: sym, estimate: false });
    }
    const seen = new Set<string>();
    const uniq = flat.filter((e) => {
      const k = `${e.date}|${e.symbol}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const today = todayISO();
    const upcoming = groupByDate(uniq.filter((e) => e.date >= today)).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const past = groupByDate(uniq.filter((e) => e.date < today)).sort((a, b) =>
      b.date.localeCompare(a.date),
    );
    return { upcoming, past, noData, pending };
  }, [symbols, cache]);

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">Earnings calendar</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Report days for every ticker in your statements. From Yahoo Finance — unconfirmed dates
          show <span className="rounded bg-secondary px-1 py-0.5 text-[11px]">est.</span>
        </p>

        {symbols.length === 0 ? (
          <p className="mt-10 rounded-2xl bg-card p-10 text-center text-sm text-muted-foreground">
            No trades yet.{" "}
            <Link to="/" className="text-foreground underline">
              Import a CSV
            </Link>{" "}
            on the calendar page and this fills in.
          </p>
        ) : (
          <>
            {pending > 0 && (
              <p className="mt-6 text-xs text-muted-foreground">
                Fetching {loading.length > 0 ? loading.join(", ") : `${pending} more`}…
              </p>
            )}

            <Section title="Upcoming" rows={upcoming} rel empty="No upcoming dates published." />
            <Section title="Recent" rows={past} />

            {noData.length > 0 && (
              <p className="mt-8 text-xs text-muted-foreground">
                No earnings (ETF / index / fund): {noData.sort().join(", ")}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Section({
  title,
  rows,
  rel = false,
  empty,
}: {
  title: string;
  rows: Row[];
  rel?: boolean;
  empty?: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-card px-4 py-3 text-sm text-muted-foreground">
          {empty ?? "Nothing yet."}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card">
          {rows.map((row, i) => (
            <li
              key={row.date}
              className={cn(
                "flex items-baseline gap-3 px-4 py-2.5",
                rel && i === 0 && "bg-secondary/40",
              )}
            >
              <span className="w-36 shrink-0 text-sm font-medium tabular-nums">
                {fmtDate(row.date)}
              </span>
              <span className="flex flex-1 flex-wrap gap-x-2 gap-y-1">
                {row.items.map((it) => (
                  <span key={it.symbol} className="text-sm font-semibold">
                    {it.symbol}
                    {it.estimate && (
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                        est.
                      </span>
                    )}
                  </span>
                ))}
              </span>
              {rel && (
                <span className="shrink-0 text-xs text-muted-foreground">{relDays(row.date)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
