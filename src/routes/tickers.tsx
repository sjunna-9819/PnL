import { createFileRoute } from "@tanstack/react-router";
import { DashProvider } from "@/components/pnl/dashboard/context";
import { TickerBreakdown } from "@/components/pnl/dashboard/parts";

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

function TickersPage() {
  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-background text-foreground">
      <div className="w-full px-4 py-10 sm:px-6 lg:px-24">
        <h1 className="text-3xl font-bold tracking-tight">Ticker P&amp;L</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Profit and loss by symbol. Tap a row to see the contracts behind it. This view is also
          available as a resizable widget on the dashboard.
        </p>
        <div className="mt-6 h-[72vh] rounded-xl bg-card p-4">
          <DashProvider>
            <TickerBreakdown />
          </DashProvider>
        </div>
      </div>
    </main>
  );
}
