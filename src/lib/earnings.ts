import { useSyncExternalStore } from "react";

import type { EarningsCompany } from "@/lib/marketData";

/**
 * Cache of the market-wide earnings calendar, one entry per calendar day
 * (`"YYYY-MM-DD"` → the companies reporting that day). Filled by the `/er` page
 * from `fetchEarningsDay`. Public market data, so it lives only in this
 * browser's `localStorage` — not in the cross-device sync.
 */

const KEY = "pnl-earnings-cal-v1";
const FUTURE_TTL_MS = 12 * 60 * 60 * 1000; // today / upcoming days may still change

export type EarningsDay = { fetchedAt: number; companies: EarningsCompany[] };
type Store = Record<string, EarningsDay>;

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
    /* quota — trim the oldest half and retry once */
    try {
      const keys = Object.keys(store).sort();
      store = Object.fromEntries(
        keys.slice(Math.floor(keys.length / 2)).map((k) => [k, store[k]!]),
      );
      window.localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      /* give up; keep it in memory */
    }
  }
}

/** A cached day is stale only if it is today-or-later and older than the TTL. */
export function isDayFresh(date: string, day: EarningsDay | undefined): boolean {
  if (!day) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (date < today) return true; // past days never change
  return Date.now() - day.fetchedAt < FUTURE_TTL_MS;
}

export function setEarningsDay(date: string, companies: EarningsCompany[]) {
  load();
  store = { ...store, [date]: { fetchedAt: Date.now(), companies } };
  persist();
  emit();
}

export function useEarningsCalendar(): Store {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => load(),
    () => store,
  );
}
