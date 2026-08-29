import { createFileRoute } from "@tanstack/react-router";
import { PnlCalendar } from "@/components/pnl/PnlCalendar";

const title = "PnL Calendar — Daily Trading P&L from Broker CSVs";
const description =
  "Import broker CSV exports and see daily profit and loss on a calendar, with per-ticker results and open position status for each trading day.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <PnlCalendar />
    </main>
  );
}
