import { useEffect } from "react";
import { toast } from "sonner";

import { syncInbox } from "@/lib/inbox";
import { hydrateState } from "@/lib/pnlStore";
import { hydrateBenchmarks } from "@/lib/benchmarks";

/**
 * Polls the server's watch-folder (see `inbox.ts`) on an interval. When a new
 * CSV has been folded into the journal, hydrate the store from the returned
 * snapshot so the open page updates without a refresh. Silently no-ops when the
 * app isn't served by a Node server.
 */
const POLL_MS = 6000;

export function useInboxWatch() {
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const loop = async () => {
      await tick();
      if (alive) timer = setTimeout(() => void loop(), POLL_MS);
    };

    const tick = async () => {
      let res;
      try {
        res = await syncInbox({ data: {} });
      } catch {
        return; // offline / static host / aborted request
      }
      if (!alive || !res.changed || !res.blob) return;

      const parsed = JSON.parse(res.blob) as {
        files?: Parameters<typeof hydrateState>[0]["files"];
        commissions?: Parameters<typeof hydrateState>[0]["commissions"];
        principal?: number;
        benchmarks?: Record<string, { date: string; close: number }[]>;
      };
      hydrateState({
        files: parsed.files ?? [],
        ...(parsed.commissions ? { commissions: parsed.commissions } : {}),
        ...(typeof parsed.principal === "number" ? { principal: parsed.principal } : {}),
      });
      hydrateBenchmarks(parsed.benchmarks ?? {});

      if (res.fills > 0) {
        toast.success(
          `Imported ${res.fills} new fill${res.fills === 1 ? "" : "s"} from the inbox folder`,
        );
      }
    };

    void loop();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);
}
