import { useSyncExternalStore } from "react";

import type { EarningsInfo } from "@/lib/marketData";

/**
 * Cached earnings dates per ticker (from Yahoo `quoteSummary`, see
 * `marketData.ts` → `fetchEarnings`). Keyed by uppercase symbol. Persisted to
 * `localStorage` and mirrored to the server file by the cross-device sync.
 */

const KEY = "pnl-earnings-v1";
/** Re-fetch a symbol if its cache is older than this (dates get confirmed / move). */
export const EARNINGS_TTL_MS = 24 * 60 * 60 * 1000;

type Store = Record<string, EarningsInfo>;

let store: Store = {};
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load(): Store {
  if (loaded) return store;
  loaded = true;
  if (typeof window === "undefined") return store;
  try {
    store = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    store = {};
  }
  return store;
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function setEarnings(info: EarningsInfo) {
  load();
  store = { ...store, [info.symbol.toUpperCase()]: info };
  persist();
  emit();
}

export function subscribeEarnings(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function snapshotEarnings(): Store {
  return load();
}

export function hydrateEarnings(next: Store) {
  load();
  store = { ...next };
  persist();
  emit();
}

export function useEarnings(): Store {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => load(),
    () => store,
  );
}
