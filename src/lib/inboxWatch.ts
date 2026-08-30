import { useEffect } from "react";
import { toast } from "sonner";

import { syncInbox } from "@/lib/inbox";
import { mergeAutoImportFills } from "@/lib/pnlStore";

/**
 * Polls the server's watch folder (see `inbox.ts`). New fills are folded into
 * the store; the existing cloud-sync then persists the change. Silently no-ops
 * when the app isn't served by a Node server.
 */
const POLL_MS = 6000;

export function useInboxWatch() {
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      let res;
      try {
        res = await syncInbox({ data: {} });
      } catch {
        return; // offline / static host / aborted request
      }
      if (!alive || res.fills.length === 0) return;

      const added = mergeAutoImportFills(res.fills);
      if (added > 0) {
        toast.success(`Imported ${added} new fill${added === 1 ? "" : "s"} from the inbox folder`);
      }
    };

    const loop = async () => {
      await tick();
      if (alive) timer = setTimeout(() => void loop(), POLL_MS);
    };

    void loop();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);
}
