import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDataset } from "@/lib/pnlStore";
import { KindBadge, Stat } from "@/components/pnl/shared";
import { fmtMoney, fmtMoneyShort, symbolGroups, type SymbolGroup } from "@/lib/pnl";

const title = "Ticker P&L — Profit and Loss by Symbol and Contract";
const description =
  "See realized profit and loss for every ticker you traded, broken down by call, put and stock, with open positions and trade counts.";

export const Route = createFileRoute("/tickers")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TickersPage,
});

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

function TickersPage() {
  const data = useDataset();
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
  const total = groups.reduce((s, g) => s + g.pnl, 0);
  const winners = groups.filter((g) => g.pnl > 0).length;
  const best = groups.reduce<SymbolGroup | null>(
    (b, g) => (g.pnl > (b?.pnl ?? -Infinity) ? g : b),
    null,
  );

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

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">Ticker P&amp;L</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Profit and loss by symbol. Tap a row to see the contracts behind it.
        </p>

        {!data || groups.length === 0 ? (
          <p className="mt-10 rounded-xl bg-card p-10 text-center text-sm text-muted-foreground">
            No data yet — import a CSV on the calendar page first.
          </p>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat label="Total P&L" value={fmtMoneyShort(total)} tone={total} />
              <Stat label="Commissions" value={`-$${(data.totalFees ?? 0).toFixed(2)}`} />
              <Stat label="Green symbols" value={`${winners}/${groups.length}`} />
              <Stat
                label="Best symbol"
                value={best ? `${best.symbol} ${fmtMoneyShort(best.pnl)}` : "—"}
                tone={best?.pnl ?? 0}
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg bg-card px-3 py-2">
                <Search className="size-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter symbols…"
                  className="w-40 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-card p-1">
                {SORTS.map((s) => {
                  const active = sort === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => pickSort(s)}
                      aria-pressed={active}
                      title={
                        active
                          ? `Sorted by ${s.label} ${dir === "asc" ? "ascending" : "descending"} — click to reverse`
                          : `Sort by ${s.label}`
                      }
                      className={cn(
                        "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
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
              <span className="text-xs text-muted-foreground">
                {visible.length} of {groups.length} symbols
              </span>
            </div>

            {visible.length === 0 ? (
              <p className="mt-4 rounded-xl bg-card p-8 text-center text-sm text-muted-foreground">
                No symbols match &ldquo;{query}&rdquo;.
              </p>
            ) : (
              <div className="mt-4 divide-y divide-border overflow-hidden rounded-xl bg-card">
                {visible.map((g) => {
                  const isOpen = open.has(g.symbol);
                  const firstDay = groupFirstDay(g);
                  return (
                    <div key={g.symbol}>
                      <button
                        onClick={() => toggle(g.symbol)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-secondary/30"
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
                            style={{
                              width: `${Math.max((Math.abs(g.pnl) / maxAbs) * 100, 16)}%`,
                            }}
                          >
                            <span className="whitespace-nowrap text-xs font-bold tabular-nums text-background">
                              {fmtMoney(g.pnl)}
                            </span>
                          </span>
                        </span>
                      </button>

                      {isOpen && (
                        <div className="border-t border-border bg-secondary/20 px-5 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                              {groupVolume(g).toLocaleString()} contracts/shares closed
                              {g.fees > 0 ? ` · net of $${g.fees.toFixed(2)} commissions` : ""}
                            </p>
                            {firstDay && (
                              <Link
                                to="/"
                                search={{ day: firstDay }}
                                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                              >
                                View on calendar →
                              </Link>
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
            )}
          </>
        )}
      </div>
    </main>
  );
}
