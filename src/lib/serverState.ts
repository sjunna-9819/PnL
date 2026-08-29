import { createServerFn } from "@tanstack/react-start";

/**
 * Whole-journal persistence on the machine that serves the app.
 *
 * Everything the app knows — imported statements, commission settings, the
 * account principal, and the cached index price history — is written to a
 * single JSON file on the server's disk. Any device that can reach the server
 * (your laptop, your phone on the same Wi-Fi) then loads the same journal.
 *
 * The browser still keeps its own `localStorage` copy as an offline cache; the
 * server file is the source of truth and wins on load. Concurrent edits from
 * two devices are last-write-wins.
 *
 * Storage path: `$PNL_DATA_DIR/state.json`, or `~/.pnl-calendar/state.json`.
 */

async function nodeFs() {
  const [{ promises: fs }, os, path] = await Promise.all([
    import("node:fs"),
    import("node:os"),
    import("node:path"),
  ]);
  const dir = process.env["PNL_DATA_DIR"] || path.join(os.homedir(), ".pnl-calendar");
  return { fs, dir, file: path.join(dir, "state.json") };
}

export const loadServerState = createServerFn({ method: "POST" })
  .validator((): Record<string, never> => ({}))
  .handler(async (): Promise<{ blob: string | null }> => {
    try {
      const { fs, file } = await nodeFs();
      return { blob: await fs.readFile(file, "utf8") };
    } catch {
      return { blob: null };
    }
  });

export const saveServerState = createServerFn({ method: "POST" })
  .validator((d: { blob: string }): { blob: string } => ({ blob: String(d.blob) }))
  .handler(async ({ data }): Promise<{ ok: boolean; bytes: number }> => {
    const { fs, dir, file } = await nodeFs();
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, data.blob, "utf8");
    await fs.rename(tmp, file); // atomic replace
    return { ok: true, bytes: Buffer.byteLength(data.blob) };
  });
