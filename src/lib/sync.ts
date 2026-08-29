import { useEffect } from "react";

import { loadServerState, saveServerState } from "@/lib/serverState";
import { hydrateState, snapshotState, subscribeStore } from "@/lib/pnlStore";
import { hydrateBenchmarks, snapshotBenchmarks, subscribeBenchmarks } from "@/lib/benchmarks";
import { hydrateEarnings, snapshotEarnings, subscribeEarnings } from "@/lib/earnings";
import type { EarningsInfo } from "@/lib/marketData";

/**
 * Keeps the journal in sync with the server file (see `serverState.ts`).
 *
 * On first mount it pulls the server snapshot and, if there is one, replaces
 * local state with it. After that, every store change is debounced and pushed
 * back to the server. `localStorage` keeps working as an offline cache.
 */

const BLOB_VERSION = 1;
const DEBOUNCE_MS = 900;

let pulled = false;
let ready = false;
let lastSent = "";
let timer: ReturnType<typeof setTimeout> | undefined;

function currentBlob(): string {
  return JSON.stringify({
    v: BLOB_VERSION,
    ...snapshotState(),
    benchmarks: snapshotBenchmarks(),
    earnings: snapshotEarnings(),
  });
}

function scheduleSave() {
  if (!ready) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const blob = currentBlob();
    if (blob === lastSent) return;
    lastSent = blob;
    void saveServerState({ data: { blob } }).catch(() => {
      lastSent = ""; // let the next change retry
    });
  }, DEBOUNCE_MS);
}

export function useCloudSync() {
  useEffect(() => {
    let alive = true;
    const unsubs: Array<() => void> = [];

    (async () => {
      if (!pulled) {
        pulled = true;
        try {
          const { blob } = await loadServerState({ data: {} });
          if (alive && blob) {
            const parsed = JSON.parse(blob) as {
              files?: Parameters<typeof hydrateState>[0]["files"];
              commissions?: Parameters<typeof hydrateState>[0]["commissions"];
              principal?: number;
              benchmarks?: Record<string, { date: string; close: number }[]>;
              earnings?: Record<string, EarningsInfo>;
            };
            hydrateState({
              files: parsed.files ?? [],
              ...(parsed.commissions ? { commissions: parsed.commissions } : {}),
              ...(typeof parsed.principal === "number" ? { principal: parsed.principal } : {}),
            });
            hydrateBenchmarks(parsed.benchmarks ?? {});
            hydrateEarnings(parsed.earnings ?? {});
            lastSent = currentBlob(); // don't immediately echo what we just loaded
          }
        } catch {
          /* offline / not served by a server — stay on localStorage only */
        }
        ready = true;
      }

      if (!alive) return;
      unsubs.push(subscribeStore(scheduleSave));
      unsubs.push(subscribeBenchmarks(scheduleSave));
      unsubs.push(subscribeEarnings(scheduleSave));
      scheduleSave(); // push local data up on a fresh server file
    })();

    return () => {
      alive = false;
      for (const u of unsubs) u();
    };
  }, []);
}
