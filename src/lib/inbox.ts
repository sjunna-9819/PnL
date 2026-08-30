import { createServerFn } from "@tanstack/react-start";
import { parseStatement, type Fill } from "@/lib/pnl";

/**
 * Watch-folder import.
 *
 * The server watches `$PNL_INBOX_DIR` (default `~/.pnl-calendar/inbox`). Drop a
 * broker "Account Statement" CSV in there — from a manual download or a cron
 * script — and the next `syncInbox()` call parses it, dedupes the fills against
 * everything already imported, folds them into the journal file, and moves the
 * source CSV into `inbox/processed/`. The browser polls this on an interval, so
 * a dropped file shows up on the open page within a few seconds.
 *
 * Only works when the app is served by the Node server. Overlapping daily
 * exports are safe — fills are deduped by execution identity.
 */

const AUTO_FILE = "TOS auto-import";
const BLOB_VERSION = 1;

type SerFile = { name: string; fills: Fill[]; official: [string, [string, number][]][] };
type Blob = {
  v?: number;
  files?: SerFile[];
  commissions?: unknown;
  principal?: number;
  benchmarks?: unknown;
};

/** Stable identity for one execution, so re-exported statements don't double-count. */
const fillKey = (f: Fill) => `${f.ts}|${f.label}|${f.qty}|${f.price}|${f.posEffect}`;

function dedupe(fills: Fill[]): Fill[] {
  const seen = new Set<string>();
  const out: Fill[] = [];
  for (const f of fills) {
    const k = fillKey(f);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out.sort((a, b) => a.ts - b.ts);
}

async function nodeCtx() {
  const [{ promises: fs }, os, path] = await Promise.all([
    import("node:fs"),
    import("node:os"),
    import("node:path"),
  ]);
  const home = path.join(os.homedir(), ".pnl-calendar");
  const dataDir = process.env["PNL_DATA_DIR"] || home;
  const inbox = process.env["PNL_INBOX_DIR"] || path.join(dataDir, "inbox");
  return {
    fs,
    path,
    inbox,
    processed: path.join(inbox, "processed"),
    stateFile: path.join(dataDir, "state.json"),
  };
}

export type InboxResult = {
  changed: boolean;
  blob: string | null;
  imported: number;
  fills: number;
  dir: string;
  error?: string;
};

export const syncInbox = createServerFn({ method: "POST" })
  .validator((): Record<string, never> => ({}))
  .handler(async (): Promise<InboxResult> => {
    const { fs, path, inbox, processed, stateFile } = await nodeCtx();

    try {
      await fs.mkdir(processed, { recursive: true });

      const entries = await fs.readdir(inbox);
      const csvs = entries.filter((n) => n.toLowerCase().endsWith(".csv"));
      if (csvs.length === 0) {
        return { changed: false, blob: null, imported: 0, fills: 0, dir: inbox };
      }

      // Parse every pending CSV.
      const parsed: Fill[] = [];
      const moved: string[] = [];
      for (const name of csvs.sort()) {
        const src = path.join(inbox, name);
        try {
          const text = await fs.readFile(src, "utf8");
          parsed.push(...parseStatement(text, name).fills);
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          await fs.rename(src, path.join(processed, `${stamp}__${name}`));
          moved.push(name);
        } catch {
          /* leave an unreadable file in place for next time */
        }
      }
      if (parsed.length === 0) {
        return { changed: false, blob: null, imported: moved.length, fills: 0, dir: inbox };
      }

      // Merge into the journal file, deduping against the existing auto entry.
      let blob: Blob = {};
      try {
        blob = JSON.parse(await fs.readFile(stateFile, "utf8")) as Blob;
      } catch {
        /* no journal yet — start one */
      }
      const files = (blob.files ?? []).filter((f) => f.name !== AUTO_FILE);
      const prior = (blob.files ?? []).find((f) => f.name === AUTO_FILE);
      const merged = dedupe([...(prior?.fills ?? []), ...parsed]);

      const before = prior ? prior.fills.length : 0;
      if (merged.length === before && prior) {
        return { changed: false, blob: null, imported: moved.length, fills: 0, dir: inbox };
      }

      const next: Blob = {
        ...blob,
        v: blob.v ?? BLOB_VERSION,
        files: [...files, { name: AUTO_FILE, fills: merged, official: [] }],
      };
      const out = JSON.stringify(next);
      const tmp = `${stateFile}.${process.pid}.tmp`;
      await fs.writeFile(tmp, out, "utf8");
      await fs.rename(tmp, stateFile);

      return {
        changed: true,
        blob: out,
        imported: moved.length,
        fills: merged.length - before,
        dir: inbox,
      };
    } catch (err) {
      return {
        changed: false,
        blob: null,
        imported: 0,
        fills: 0,
        dir: inbox,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
