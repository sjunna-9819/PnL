import { Link } from "@tanstack/react-router";

const LINKS = [
  { to: "/", label: "Calendar", exact: true },
  { to: "/tickers", label: "Ticker P/L", exact: false },
  { to: "/blog", label: "Blog", exact: false },
] as const;

const baseLink = "rounded-md px-3 py-1.5 text-sm font-medium transition-colors";

export function NavBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2" title="Calendar — home">
          <span className="text-sm font-semibold tracking-tight">PnL Calendar</span>
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: l.exact }}
              className={`${baseLink} text-muted-foreground hover:text-foreground`}
              activeProps={{ className: `${baseLink} bg-secondary text-foreground` }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
