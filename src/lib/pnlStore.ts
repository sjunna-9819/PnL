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

/** One imported statement: its fills plus any broker-reported daily P/L it carried. */
export type ImportedFile = {
  name: string;
  fills: Fill[];
  official: Map<string, Map<string, number>>;
};

export type FileSummary = { name: string; fills: number; from: string | null; to: string | null };

type SerFile = { name: string; fills: Fill[]; official: [string, [string, number][]][] };

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

let files: ImportedFile[] = [];
let dataset: Dataset | null = null;
let summary: FileSummary[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function deriveDataset(list: ImportedFile[]): Dataset | null {
  if (list.length === 0) return null;
  const allFills = list.flatMap((f) => f.fills);
  const names = list.map((f) => f.name);
  const official = new Map<string, Map<string, number>>();
  for (const f of list) for (const [d, rows] of f.official) official.set(d, new Map(rows));
  return buildDataset(allFills, names, official, loadCommissions());
}

function summarize(list: ImportedFile[]): FileSummary[] {
  return list.map((f) => {
    const dates = f.fills.map((x) => x.date).sort();
    return {
      name: f.name,
      fills: f.fills.length,
      from: dates[0] ?? null,
      to: dates.at(-1) ?? null,
    };
  });
}

/** Recompute derived state after any mutation of `files`, then persist + notify. */
function commit() {
  dataset = deriveDataset(files);
  summary = summarize(files);
  persist();
  emit();
}

function migrate(parsed: unknown): ImportedFile[] {
  const p = parsed as Record<string, unknown>;
  if (p && p["v"] === 2 && Array.isArray(p["files"])) {
    return (p["files"] as SerFile[]).map((f) => ({
      name: f.name,
      fills: f.fills,
      official: new Map(f.official.map(([d, rows]) => [d, new Map(rows)])),
    }));
  }
  // v1: { fills, files: string[], official }
  const v1Fills = (p?.["fills"] as Fill[] | undefined) ?? [];
  const v1Names = (p?.["files"] as string[] | undefined) ?? [];
  const v1Official = new Map<string, Map<string, number>>(
    ((p?.["official"] as [string, [string, number][]][] | undefined) ?? []).map(([d, rows]) => [
      d,
      new Map(rows),
    ]),
  );
  const bySource = new Map<string, Fill[]>();
  for (const f of v1Fills) {
    const list = bySource.get(f.source) ?? [];
    list.push(f);
    bySource.set(f.source, list);
  }
  const order = v1Names.length ? v1Names : [...bySource.keys()];
  const seen = new Set<string>();
  const out: ImportedFile[] = [];
  for (const name of [...order, ...bySource.keys()]) {
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, fills: bySource.get(name) ?? [], official: new Map() });
  }
  if (out.length === 0 && v1Fills.length) {
    out.push({ name: "imported.csv", fills: v1Fills, official: new Map() });
  }
  const last = out.at(-1);
  if (last && v1Official.size) last.official = v1Official;
  return out;
}

function load(): Dataset | null {
  if (loaded) return dataset;
  loaded = true;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    files = migrate(JSON.parse(raw));
    dataset = deriveDataset(files);
    summary = summarize(files);
  } catch {
    files = [];
    dataset = null;
    summary = [];
  }
  return dataset;
}

function persist() {
  if (typeof window === "undefined") return;
  if (files.length === 0) {
    window.localStorage.removeItem(KEY);
    return;
  }
  const payload = {
    v: 2 as const,
    files: files.map((f) => ({
      name: f.name,
      fills: f.fills,
      official: [...f.official].map(([d, m]) => [d, [...m]]),
    })),
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* quota — keep in memory only */
  }
}

/** Append newly parsed statements. Returns the resulting dataset. */
export function addImportedFiles(incoming: ImportedFile[]): Dataset | null {
  load();
  files = [...files, ...incoming];
  loaded = true;
  commit();
  return dataset;
}

/** Drop one imported file by its index in `useImportedFiles()`. */
export function removeImportedFile(index: number) {
  load();
  if (index < 0 || index >= files.length) return;
  files = files.filter((_, i) => i !== index);
  commit();
}

/** Undo the most recent import (which appended `count` files at the end). */
export function removeLastImportedFiles(count: number) {
  load();
  if (count <= 0) return;
  files = files.slice(0, Math.max(0, files.length - count));
  commit();
}

export function clearAllData() {
  files = [];
  loaded = true;
  commit();
}

/** Replace everything with a not-file-backed dataset used only by the demo. */
export function loadDemoFiles(demo: ImportedFile) {
  files = [demo];
  loaded = true;
  commit();
}

export function useImportedFiles(): FileSummary[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => {
      load();
      return summary;
    },
    () => summary,
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
  dataset = deriveDataset(files);
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
