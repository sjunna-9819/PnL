import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Rect } from "./types";

export const COLS = 12;
const ROW_H = 76;
const GAP = 12;

export type GridItem = { id: string; rect: Rect };
export type MinSize = { w: number; h: number };

type DragApi = {
  /** Spread onto the widget's drag handle (its header). */
  moveHandle: { onPointerDown: (e: React.PointerEvent) => void };
};

function overlap(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clampRect(r: Rect, min: MinSize): Rect {
  const w = Math.max(min.w, Math.min(r.w, COLS));
  const h = Math.max(min.h, r.h);
  const x = Math.max(0, Math.min(r.x, COLS - w));
  const y = Math.max(0, r.y);
  return { x, y, w, h };
}

/**
 * Vertical compaction — pulls every item up as far as it will go while
 * preserving vertical order. `pinId` (the item being dragged) keeps its rect.
 */
export function compact(items: GridItem[], pinId?: string): GridItem[] {
  const pin = pinId ? items.find((i) => i.id === pinId) : undefined;
  const rest = items
    .filter((i) => i.id !== pinId)
    .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  const placed: GridItem[] = pin ? [pin] : [];
  for (const it of rest) {
    let y = 0;
    while (placed.some((p) => overlap({ ...it.rect, y }, p.rect))) y++;
    placed.push({ id: it.id, rect: { ...it.rect, y } });
  }
  return placed;
}

/** Next free spot for a freshly added widget: a full-width row at the bottom. */
export function appendRect(items: GridItem[], size: MinSize): Rect {
  const bottom = items.reduce((m, i) => Math.max(m, i.rect.y + i.rect.h), 0);
  return { x: 0, y: bottom, w: Math.min(Math.max(size.w, 4), COLS), h: size.h };
}

export function GridLayout({
  items,
  editing,
  minSizes,
  onCommit,
  render,
}: {
  items: GridItem[];
  editing: boolean;
  minSizes: Record<string, MinSize>;
  onCommit: (items: GridItem[]) => void;
  render: (id: string, api: DragApi) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [draft, setDraft] = useState<GridItem[] | null>(null);
  const draftRef = useRef<GridItem[] | null>(null);
  const dragRef = useRef<{ id: string; mode: "move" | "resize" } | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const live = draft ?? items;
  const colW = width > 0 ? (width - GAP * (COLS - 1)) / COLS : 0;
  const rows = useMemo(() => Math.max(1, ...live.map((i) => i.rect.y + i.rect.h)), [live]);

  const cellStyle = (r: Rect): React.CSSProperties => ({
    left: r.x * (colW + GAP),
    top: r.y * (ROW_H + GAP),
    width: r.w * colW + (r.w - 1) * GAP,
    height: r.h * ROW_H + (r.h - 1) * GAP,
  });

  function startDrag(e: React.PointerEvent, id: string, mode: "move" | "resize") {
    if (!editing || colW === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const base = live.find((i) => i.id === id);
    if (!base) return;
    const min = minSizes[id] ?? { w: 2, h: 2 };
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = base.rect;
    const snapshot = live;
    dragRef.current = { id, mode };

    const move = (ev: PointerEvent) => {
      const dc = Math.round((ev.clientX - startX) / (colW + GAP));
      const dr = Math.round((ev.clientY - startY) / (ROW_H + GAP));
      const next =
        mode === "move"
          ? clampRect({ ...startRect, x: startRect.x + dc, y: startRect.y + dr }, min)
          : clampRect({ ...startRect, w: startRect.w + dc, h: startRect.h + dr }, min);
      const candidate = snapshot.map((i) => (i.id === id ? { id, rect: next } : i));
      const packed = compact(candidate, id);
      draftRef.current = packed;
      setDraft(packed);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragRef.current = null;
      const packed = draftRef.current;
      draftRef.current = null;
      setDraft(null);
      if (packed) onCommit(packed);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Mobile: no grid — stack widgets full-width in layout order.
  if (isMobile) {
    const ordered = [...items].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
    return (
      <div className="flex flex-col gap-3">
        {ordered.map((it) => (
          <div key={it.id} style={{ minHeight: it.rect.h * ROW_H }}>
            {render(it.id, { moveHandle: { onPointerDown: () => {} } })}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative w-full" style={{ height: rows * (ROW_H + GAP) - GAP }}>
      {editing && colW > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-lg"
          style={{
            backgroundImage: "linear-gradient(to right, var(--color-border) 1px, transparent 1px)",
            backgroundSize: `${colW + GAP}px 100%`,
            opacity: 0.4,
          }}
        />
      )}
      {live.map((it) => {
        const dragging = dragRef.current?.id === it.id;
        return (
          <div
            key={it.id}
            className={cn(
              "absolute",
              dragging ? "z-20" : "z-0",
              !dragging && "transition-[left,top,width,height] duration-150 ease-out",
            )}
            style={cellStyle(it.rect)}
          >
            <div
              className={cn(
                "h-full",
                editing && "ring-1 ring-border rounded-xl",
                dragging && "opacity-90 shadow-2xl",
              )}
            >
              {render(it.id, {
                moveHandle: { onPointerDown: (e) => startDrag(e, it.id, "move") },
              })}
            </div>
            {editing && (
              <button
                type="button"
                aria-label="Resize widget"
                onPointerDown={(e) => startDrag(e, it.id, "resize")}
                className="absolute -bottom-1 -right-1 z-30 flex size-5 cursor-se-resize items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground"
              >
                <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden>
                  <path
                    d="M8 1v7H1M8 4.5H4.5V8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
