import { useSyncExternalStore } from "react";
import type { Rect, WidgetId } from "@/components/pnl/dashboard/types";

/**
 * Persistent dashboard layout: where each widget sits on the grid and which
 * widgets are currently hidden. Rects are kept even for hidden widgets so
 * toggling one back on restores it where it was.
 */
// v2: day detail became a click-to-open popup instead of a grid widget.
// v3: ticker P&L folded into the equity widget as a switchable view.
// v4: added the daily-digest widget; calendar shifts right to make room.
const KEY = "pnl-dashboard-v4";

export type DashState = {
  rects: Partial<Record<WidgetId, Rect>>;
  hidden: WidgetId[];
};

const EMPTY: DashState = { rects: {}, hidden: [] };

let state: DashState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

function load(): DashState {
  if (loaded) return state;
  loaded = true;
  if (typeof window === "undefined") return state;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<DashState>;
      state = { rects: p.rects ?? {}, hidden: p.hidden ?? [] };
    }
  } catch {
    /* ignore corrupt layout */
  }
  return state;
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota — keep in memory only */
  }
}

export function setDashState(next: DashState) {
  load();
  state = next;
  persist();
  emit();
}

export function resetDashState() {
  loaded = true;
  state = EMPTY;
  persist();
  emit();
}

export function useDashState(): DashState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => load(),
    () => EMPTY,
  );
}
