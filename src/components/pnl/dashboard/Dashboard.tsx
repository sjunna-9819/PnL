import { useMemo, useState } from "react";
import { Check, GripVertical, Plus, RotateCcw, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useDataset } from "@/lib/pnlStore";
import { resetDashState, setDashState, useDashState } from "@/lib/dashboardStore";
import { DashProvider } from "./context";
import { appendRect, compact, GridLayout, type GridItem } from "./grid";
import { MIN_SIZES, WIDGET_BY_ID, WIDGETS } from "./registry";
import { DayDetailDialog, ImportDropzone } from "./parts";
import type { Rect, WidgetId } from "./types";

const ALL_IDS = WIDGETS.map((w) => w.id);

export function Dashboard({ initialDay }: { initialDay?: string | undefined }) {
  const data = useDataset();
  const { rects, hidden } = useDashState();
  const [editing, setEditing] = useState(false);

  const visibleIds = ALL_IDS.filter((id) => !hidden.includes(id));
  const visibleKey = visibleIds.join(",");
  const rectsKey = JSON.stringify(rects);

  const items = useMemo<GridItem[]>(() => {
    const raw = visibleIds.map((id) => ({
      id,
      rect: rects[id] ?? WIDGET_BY_ID[id].default,
    }));
    return compact(raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, rectsKey]);

  function persistRects(next: GridItem[]) {
    const merged: Partial<Record<WidgetId, Rect>> = { ...rects };
    for (const it of next) merged[it.id as WidgetId] = it.rect;
    setDashState({ rects: merged, hidden });
  }

  function hideWidget(id: WidgetId) {
    const cur = items.find((i) => i.id === id);
    const merged: Partial<Record<WidgetId, Rect>> = { ...rects };
    if (cur) merged[id] = cur.rect;
    setDashState({ rects: merged, hidden: [...hidden, id] });
  }

  function showWidget(id: WidgetId) {
    const merged: Partial<Record<WidgetId, Rect>> = { ...rects };
    if (!merged[id]) merged[id] = appendRect(items, WIDGET_BY_ID[id].min);
    setDashState({ rects: merged, hidden: hidden.filter((h) => h !== id) });
  }

  return (
    <DashProvider initialDay={initialDay}>
      <div className="w-full px-4 py-3 sm:px-6 lg:px-24">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {editing ? "Editing layout — drag headers, pull the corner to resize" : "Dashboard"}
          </p>
          <div className="flex items-center gap-2">
            {editing && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="secondary" size="sm" className="h-8">
                      <Plus /> Add widget
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-56 p-1.5">
                    {hidden.length === 0 ? (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">
                        Every widget is on the board.
                      </p>
                    ) : (
                      hidden.map((id) => {
                        const def = WIDGET_BY_ID[id];
                        const Icon = def.icon;
                        return (
                          <button
                            key={id}
                            onClick={() => showWidget(id)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
                          >
                            <Icon className="size-4 text-muted-foreground" />
                            {def.title}
                          </button>
                        );
                      })
                    )}
                  </PopoverContent>
                </Popover>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-muted-foreground"
                  onClick={() => {
                    resetDashState();
                  }}
                >
                  <RotateCcw /> Reset
                </Button>
              </>
            )}
            <Button
              variant={editing ? "default" : "secondary"}
              size="sm"
              className="h-8"
              onClick={() => setEditing((e) => !e)}
            >
              {editing ? <Check /> : <Settings2 />}
              {editing ? "Done" : "Edit layout"}
            </Button>
          </div>
        </div>

        {!data ? (
          <ImportDropzone />
        ) : (
          <GridLayout
            items={items}
            editing={editing}
            minSizes={MIN_SIZES}
            onCommit={persistRects}
            render={(id, api) => {
              const def = WIDGET_BY_ID[id as WidgetId];
              const Icon = def.icon;
              const Body = def.Component;
              return (
                <section className="flex h-full flex-col overflow-hidden rounded-xl bg-card">
                  <header
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
                      editing && "cursor-grab active:cursor-grabbing select-none bg-secondary/40",
                    )}
                    {...(editing ? api.moveHandle : {})}
                  >
                    {editing && <GripVertical className="size-3.5" />}
                    <Icon className="size-3.5" />
                    <span className="flex-1 truncate">{def.title}</span>
                    {editing && (
                      <button
                        type="button"
                        aria-label={`Hide ${def.title}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => hideWidget(id as WidgetId)}
                        className="rounded p-0.5 hover:bg-loss/20 hover:text-loss"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </header>
                  <div
                    className={cn(
                      "min-h-0 flex-1 overflow-auto p-3 pt-2",
                      editing && "pointer-events-none opacity-90",
                    )}
                  >
                    <Body />
                  </div>
                </section>
              );
            }}
          />
        )}
      </div>
      <DayDetailDialog />
    </DashProvider>
  );
}
