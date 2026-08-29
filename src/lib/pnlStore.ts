import { useSyncExternalStore } from "react";
import {
  DEFAULT_COMMISSIONS,
  buildDataset,
  type CommissionSettings,
  type Dataset,
  type Fill,
} from "@/lib/pnl";

const KEY = "pnl-calendar-data-v1";
const COMM_KEY = "pnl-calendar-commissions-v1";

type Persisted = {
  fills: Fill[];
  files: string[];
  official: [string, [string, number][]][];
};

let commissions: CommissionSettings = DEFAULT_COMMISSIONS;
let commLoaded = false;

function loadCommissions(): CommissionSettings {
  if (commLoaded) return commissions;
  commLoaded = true;
  if (typeof window === "undefined") return commissions;
  try {
    const raw = window.localStorage.getItem(COMM_KEY);
    if (raw) commissions = { ...DEFAULT_COMMISSIONS, ...(JSON.parse(raw) as CommissionSettings) };
  } catch {
    /* ignore */
  }
  return commissions;
}

let dataset: Dataset | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function load(): Dataset | null {
  if (loaded) return dataset;
  loaded = true;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Persisted;
    const official = new Map(p.official.map(([d, rows]) => [d, new Map(rows)]));
    dataset = buildDataset(p.fills, p.files, official, loadCommissions());
  } catch {
    dataset = null;
  }
  return dataset;
}

function persist(d: Dataset | null) {
  if (typeof window === "undefined") return;
  if (!d) {
    window.localStorage.removeItem(KEY);
    return;
  }
  const payload: Persisted = {
    fills: d.fills,
    files: d.files,
    official: [...d.officialDayPnl].map(([date, m]) => [date, [...m]]),
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* quota — keep in memory only */
  }
}

export function setDataset(d: Dataset | null) {
  loaded = true;
  dataset = d;
  persist(d);
  emit();
}

/** One level of undo, for the most recent import. */
let importUndo: { previous: Dataset | null; label: string } | null = null;

/** Call right before an import merges in new files. */
export function snapshotBeforeImport(label: string) {
  importUndo = { previous: dataset, label };
  emit();
}

export function undoLastImport() {
  if (!importUndo) return;
  const { previous } = importUndo;
  importUndo = null;
  setDataset(previous);
}

export function clearImportUndo() {
  if (!importUndo) return;
  importUndo = null;
  emit();
}

export function useImportUndoLabel(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => importUndo?.label ?? null,
    () => null,
  );
}

export function getCommissions(): CommissionSettings {
  return loadCommissions();
}

export function setCommissions(next: CommissionSettings) {
  loadCommissions();
  commissions = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(COMM_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  if (dataset) {
    dataset = buildDataset(dataset.fills, dataset.files, dataset.officialDayPnl, next);
  }
  emit();
}

export function useCommissions(): CommissionSettings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => loadCommissions(),
    () => DEFAULT_COMMISSIONS,
  );
}

export function useDataset(): Dataset | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => load(),
    () => null,
  );
}
