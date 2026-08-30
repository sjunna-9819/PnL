import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/pnl/dashboard/Dashboard";

const title = "PnL Calendar — Modular Trading Dashboard from Broker CSVs";
const description =
  "Import broker CSV exports and arrange the calendar, equity curve, per-ticker P&L and an automated review as resizable widgets on one dashboard.";

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
    <main className="min-h-[calc(100dvh-3.5rem)] bg-background text-foreground">
      <Dashboard initialDay={day} />
    </main>
  );
}
