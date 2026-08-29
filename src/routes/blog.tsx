import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useDataset } from "@/lib/pnlStore";
import { journal, type Post, type PostTone } from "@/lib/blog";

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

function prettyDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const toneText: Record<PostTone, string> = {
  good: "text-profit",
  bad: "text-loss",
  neutral: "text-muted-foreground",
};
const toneDot: Record<PostTone, string> = {
  good: "bg-profit",
  bad: "bg-loss",
  neutral: "bg-muted-foreground",
};

function gradeClass(grade: string) {
  const letter = grade[0];
  if (letter === "A" || letter === "B") return "bg-profit/20 text-profit";
  if (letter === "C") return "bg-secondary text-foreground";
  return "bg-loss/20 text-loss";
}

function BlogPage() {
  const data = useDataset();
  const posts = useMemo(() => (data ? journal(data) : []), [data]);

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">Trading journal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An automated read of your imported trades — regenerated every time you import. Heuristics,
          not a crystal ball, and not financial advice.
        </p>

        {posts.length === 0 ? (
          <p className="mt-10 rounded-2xl bg-card p-10 text-center text-sm text-muted-foreground">
            No trades yet.{" "}
            <Link to="/" className="text-foreground underline">
              Import a CSV
            </Link>{" "}
            (or load the demo data) on the calendar page and the review writes itself.
          </p>
        ) : (
          <div className="mt-8 space-y-6">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} formatDate={prettyDate} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function PostCard({ post, formatDate }: { post: Post; formatDate: (d: string) => string }) {
  return (
    <article className="rounded-2xl bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{post.title}</h2>
          <p className="mt-0.5 text-xs uppercase tracking-wider text-muted-foreground">
            {formatDate(post.date)}
          </p>
        </div>
        {post.grade && (
          <div className="flex flex-col items-center">
            <span
              className={cn(
                "flex size-11 items-center justify-center rounded-xl text-lg font-bold",
                gradeClass(post.grade),
              )}
            >
              {post.grade}
            </span>
            {post.score !== undefined && (
              <span className="mt-1 text-[10px] text-muted-foreground">{post.score}/100</span>
            )}
          </div>
        )}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{post.summary}</p>

      <div className="mt-4 space-y-4">
        {post.sections.map((section, i) => (
          <div key={i}>
            <h3
              className={cn(
                "text-xs font-semibold uppercase tracking-wider",
                toneText[section.tone],
              )}
            >
              {section.heading}
            </h3>
            <ul className="mt-2 space-y-1.5">
              {section.items.map((item, j) => (
                <li key={j} className="flex gap-2 text-sm">
                  <span
                    className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", toneDot[section.tone])}
                    aria-hidden
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </article>
  );
}
