import { useCallback, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { randomQuote, type Quote } from "@/lib/quotes";

// A nimbu-mirchi (lemon & chili) totem hanging off the nav bar. Pull the cord
// like a light switch and let go — it recoils and a quote drops down.
const CORD_BASE = 12; // resting cord length, px
const CORD_MAX = 44; // furthest you can pull it
const TRIGGER_AT = 22; // pull past this and release to get a quote

export function LuckyCharm() {
  const [quote, setQuote] = useState<Quote>(() => randomQuote());
  const [open, setOpen] = useState(false);
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startY: number; startPull: number } | null>(null);

  const fire = useCallback(() => {
    setQuote((q) => randomQuote(q));
    setOpen(true);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { startY: e.clientY, startPull: pull };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const next = drag.current.startPull + (e.clientY - drag.current.startY);
    setPull(Math.max(0, Math.min(CORD_MAX, next)));
  };

  const endDrag = () => {
    if (!drag.current) return;
    const pulled = pull;
    drag.current = null;
    setDragging(false);
    setPull(0);
    if (pulled >= TRIGGER_AT) fire();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    setPull(CORD_MAX);
    window.setTimeout(() => {
      setPull(0);
      fire();
    }, 130);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative h-14 w-9 shrink-0 select-none" title="Lucky charm — pull the cord">
          <div className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col items-center">
            {/* nimbu-mirchi — natural object colors, not theme tokens */}
            <svg width="34" height="44" viewBox="0 0 34 44" aria-hidden="true">
              {/* hanging thread + top knot */}
              <line x1="17" y1="0" x2="17" y2="8" stroke="#9a6b4b" strokeWidth="1.5" />
              <circle cx="17" cy="8" r="2" fill="#c98a5e" />
              {/* lemon */}
              <ellipse
                cx="17"
                cy="15"
                rx="6"
                ry="7"
                fill="#f4c430"
                stroke="#d9a406"
                strokeWidth="1"
              />
              <path d="M17 8v2" stroke="#7a5230" strokeWidth="1.2" />
              {/* three chilies fanning down */}
              <path
                d="M17 21c-4 3-6 8-5 14 3 1 5-3 6-7s1-6-1-7z"
                fill="#3f9d43"
                stroke="#2f7a33"
                strokeWidth="0.8"
              />
              <path
                d="M17 21c0 4 0 10 0 16 0 0 3-1 3-8s-1-8-3-8z"
                fill="#4bb151"
                stroke="#2f7a33"
                strokeWidth="0.8"
              />
              <path
                d="M17 21c4 3 6 8 5 14-3 1-5-3-6-7s-1-6 1-7z"
                fill="#3f9d43"
                stroke="#2f7a33"
                strokeWidth="0.8"
              />
            </svg>

            {/* pull cord */}
            <div
              className="w-[2px] rounded-full bg-[#b98a63]"
              style={{
                height: CORD_BASE + pull,
                transition: dragging ? "none" : "height 600ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            />
            {/* the bead you grab */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Pull the lucky charm for a quote"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={onKeyDown}
              className="size-2.5 cursor-grab rounded-full bg-[#8a5a3c] ring-2 ring-[#b98a63] transition-transform active:cursor-grabbing hover:scale-110 focus-visible:outline-none focus-visible:ring-primary"
            />
          </div>
        </div>
      </PopoverAnchor>

      <PopoverContent align="end" sideOffset={10} className="w-80 space-y-3">
        <span
          className={
            "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
            (quote.kind === "trading"
              ? "bg-primary/15 text-primary"
              : "bg-profit-surface/20 text-profit")
          }
        >
          {quote.kind === "trading" ? "Trading" : "Real life"}
        </span>

        <blockquote className="text-sm leading-relaxed text-foreground">
          &ldquo;{quote.text}&rdquo;
        </blockquote>
        <p className="text-xs text-muted-foreground">— {quote.author}</p>

        <Button
          size="sm"
          variant="secondary"
          className="w-full"
          onClick={() => setQuote((q) => randomQuote(q))}
        >
          <RefreshCw /> Another charm
        </Button>
      </PopoverContent>
    </Popover>
  );
}
