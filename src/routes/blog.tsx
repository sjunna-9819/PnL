import { createFileRoute } from "@tanstack/react-router";
import { DashProvider } from "@/components/pnl/dashboard/context";
import { JournalReview } from "@/components/pnl/dashboard/parts";

const title = "Trading Journal — Automated Review of Your Imported Trades";
const description =
  "An automated read of your imported broker statements: what you are doing right, what is costing you, and what to change. Regenerated on every import.";

export const Route = createFileRoute("/blog")({
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
  component: BlogPage,
});

function BlogPage() {
  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">Trading journal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An automated read of your imported trades — regenerated every time you import. Heuristics,
          not a crystal ball, and not financial advice. Also available as a dashboard widget.
        </p>
        <div className="mt-8">
          <DashProvider>
            <JournalReview />
          </DashProvider>
        </div>
      </div>
    </main>
  );
}
