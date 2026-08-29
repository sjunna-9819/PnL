import { useSyncExternalStore } from "react";

/**
 * User-supplied index price history (SPY, QQQ, Nasdaq, …) for the equity-curve
 * comparison. Free forever: you drop in a CSV downloaded from Yahoo Finance's
 * "Download" button (or a thinkorswim / Nasdaq.com export). Historical closes
 * never change, so each file is imported once and lives in localStorage.
 */

export type BenchmarkPoint = { date: string; close: number };
type Store = Record<string, BenchmarkPoint[]>;

const KEY = "pnl-benchmarks-v1";

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

function normalizeDate(s: string): string | null {
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); // M/D/YYYY (Nasdaq.com, Schwab)
  if (m) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return `${y}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Parse a daily-price CSV: needs a Date column and a Close (or Adj Close) column. */
export function parseBenchmarkCsv(text: string): BenchmarkPoint[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const di = header.findIndex((h) => /^(date|datetime|trade date)$/.test(h));
  let ci = header.findIndex((h) => h === "adj close" || h === "adjclose");
  if (ci < 0) ci = header.findIndex((h) => h === "close" || h === "close/last" || h === "last");
  if (ci < 0) ci = header.findIndex((h) => /close/.test(h));
  if (di < 0 || ci < 0) return [];

  const out: BenchmarkPoint[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const date = normalizeDate((cells[di] ?? "").trim().replace(/^"|"$/g, ""));
    const close = Number.parseFloat((cells[ci] ?? "").replace(/[$",\s]/g, ""));
    if (date && Number.isFinite(close) && close > 0) out.push({ date, close });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export function setBenchmark(name: string, series: BenchmarkPoint[]) {
  load();
  store = { ...store, [name.toUpperCase()]: series };
  persist();
  emit();
}

export function removeBenchmark(name: string) {
  load();
  const next = { ...store };
  delete next[name];
  store = next;
  persist();
  emit();
}

/** Subscribe to benchmark changes (used by the cross-device sync). */
export function subscribeBenchmarks(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function snapshotBenchmarks(): Store {
  return load();
}

/** Replace the cached index history with a snapshot pulled from the server. */
export function hydrateBenchmarks(next: Store) {
  load();
  store = { ...next };
  persist();
  emit();
}

export function useBenchmarks(): Store {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => load(),
    () => store,
  );
}
