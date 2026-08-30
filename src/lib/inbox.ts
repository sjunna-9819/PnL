import { createServerFn } from "@tanstack/react-start";
import { parseStatement, type Fill } from "@/lib/pnl";

/**
 * Watch-folder import — server half.
 *
 * The server watches `$PNL_INBOX_DIR` (default `~/.pnl-calendar/inbox`). Drop a
 * broker "Account Statement" CSV in there — from a manual download or a cron
 * script — and every `syncInbox()` call parses every CSV in the folder and
 * returns the fills. The client (`inboxWatch.ts`) folds them in, deduped, so
 * the open page updates without a refresh.
 *
 * A file is only moved to `inbox/processed/` once it has sat for `SETTLE_MS`
 * (so it has definitely been through several polls and can't be lost to an
 * aborted request during a page load). Re-parsing a still-present file every
 * poll is harmless — the client dedupes by execution identity.
 *
 * Only works when the app is served by the Node server.
 */

const SETTLE_MS = 120_000;

async function nodeCtx() {
  const [{ promises: fs }, os, path] = await Promise.all([
    import("node:fs"),
    import("node:os"),
    import("node:path"),
  ]);
  const dataDir = process.env["PNL_DATA_DIR"] || path.join(os.homedir(), ".pnl-calendar");
  const inbox = process.env["PNL_INBOX_DIR"] || path.join(dataDir, "inbox");
  return { fs, path, inbox, processed: path.join(inbox, "processed") };
}

export type InboxFile = { name: string; fills: Fill[] };

export type InboxResult = {
  /** one entry per CSV currently in the folder, keyed by original filename */
  files: InboxFile[];
  dir: string;
  error?: string;
};

export const syncInbox = createServerFn({ method: "POST" })
  .validator((): Record<string, never> => ({}))
  .handler(async (): Promise<InboxResult> => {
    const { fs, path, inbox, processed } = await nodeCtx();

    try {
      await fs.mkdir(processed, { recursive: true });

      const entries = await fs.readdir(inbox);
      const csvs = entries.filter((n) => n.toLowerCase().endsWith(".csv")).sort();
      if (csvs.length === 0) return { files: [], dir: inbox };

      const out: InboxFile[] = [];
      const now = Date.now();
      for (const name of csvs) {
        const src = path.join(inbox, name);
        try {
          const stat = await fs.stat(src);
          const text = await fs.readFile(src, "utf8");
          const fills = parseStatement(text, name).fills;
          if (fills.length > 0) out.push({ name, fills });
          if (now - stat.mtimeMs > SETTLE_MS) {
            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            await fs.rename(src, path.join(processed, `${stamp}__${name}`));
          }
        } catch {
          /* leave an unreadable file in place for next time */
        }
      }
      return { files: out, dir: inbox };
    } catch (err) {
      return {
        files: [],
        dir: inbox,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
