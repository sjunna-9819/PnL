import { createFileRoute } from "@tanstack/react-router";
import { PnlCalendar } from "@/components/pnl/PnlCalendar";

const title = "PnL Calendar — Daily Trading P&L from Broker CSVs";
const description =
  "Import broker CSV exports and see daily profit and loss on a calendar, with per-ticker results and open position status for each trading day.";

type IndexSearch = { day?: string };

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): IndexSearch => {
    const day = search["day"];
    return typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) ? { day } : {};
  },
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
  const { day } = Route.useSearch();
  return (
    <main className="min-h-screen bg-background text-foreground">
      <PnlCalendar initialDay={day} />
    </main>
  );
}
