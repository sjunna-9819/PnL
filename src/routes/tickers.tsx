import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDataset } from "@/lib/pnlStore";
import { fmtMoney, fmtMoneyShort, symbolGroups, type InstrumentKind } from "@/lib/pnl";

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

function TickersPage() {
  const data = useDataset();
  const groups = data ? symbolGroups(data) : [];
  const total = groups.reduce((s, g) => s + g.pnl, 0);
  const winners = groups.filter((g) => g.pnl > 0).length;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to calendar
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Ticker P&amp;L</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Realized profit and loss for every symbol and contract in your imported statements.
        </p>

        {!data || groups.length === 0 ? (
          <p className="mt-10 rounded-2xl bg-card p-10 text-center text-sm text-muted-foreground">
            No data yet — import a CSV on the calendar page first.
          </p>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat label="Total P&L" value={fmtMoneyShort(total)} tone={total} />
              <Stat
                label="Commissions"
                value={`-$${(data?.totalFees ?? 0).toFixed(2)}`}
              />
              <Stat label="Green symbols" value={`${winners}/${groups.length}`} />
              <Stat
                label="Best symbol"
                value={groups[0] ? `${groups[0].symbol} ${fmtMoneyShort(groups[0].pnl)}` : "—"}
                tone={groups[0]?.pnl ?? 0}
              />
            </div>

            <div className="mt-6 space-y-4">
              {groups.map((g) => (
                <section key={g.symbol} className="rounded-2xl bg-card p-5">
                  <header className="flex items-baseline justify-between gap-4">
                    <h2 className="text-lg font-semibold">{g.symbol}</h2>
                    <span
                      className={cn(
                        "text-lg font-bold",
                        g.pnl > 0 && "text-profit",
                        g.pnl < 0 && "text-loss",
                        g.pnl === 0 && "text-muted-foreground",
                      )}
                    >
                      {fmtMoney(g.pnl)}
                    </span>
                  </header>
                  {g.fees > 0 && (
                    <p className="text-xs text-muted-foreground">
                      net of ${g.fees.toFixed(2)} commissions
                    </p>
                  )}
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
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div className="rounded-2xl bg-card p-5">
      <p
        className={cn(
          "text-xl font-bold",
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
