import { toast } from "sonner";
import { parseStatement } from "@/lib/pnl";
import {
  addImportedFiles,
  addSerializedFiles,
  clearAllData,
  removeLastImportedFiles,
  serializeFiles,
  type ImportedFile,
} from "@/lib/pnlStore";

/** Parse dropped/selected broker CSVs (or a .json backup) and append them. */
export async function importStatements(fileList: FileList | null) {
  if (!fileList?.length) return;
  const incoming: ImportedFile[] = [];
  let restored = 0;

  for (const file of Array.from(fileList)) {
    const text = await file.text();
    if (/\.json$/i.test(file.name)) {
      try {
        restored += addSerializedFiles(text);
      } catch {
        toast.error(`Couldn't read ${file.name} as a backup`);
      }
      continue;
    }
    const parsed = parseStatement(text, file.name);
    incoming.push({ name: file.name, fills: parsed.fills, official: parsed.officialDayPnl });
  }

  const added = incoming.reduce((s, f) => s + f.fills.length, 0);
  if (added === 0) {
    if (restored > 0) {
      toast.success(`Restored ${restored} file${restored === 1 ? "" : "s"} from backup`);
      return;
    }
    toast.error("No trades found in that file", {
      description: "Expecting a broker Account Statement export (Thinkorswim / Schwab).",
    });
    return;
  }

  const next = addImportedFiles(incoming);
  const label = incoming.length === 1 ? incoming[0]!.name : `${incoming.length} files`;
  toast.success(`Imported ${added} fill${added === 1 ? "" : "s"} from ${label}`, {
    description: `${next?.closed.length ?? 0} closed trades matched · ${
      next?.openPositions.length ?? 0
    } still open.`,
    duration: 12000,
    action: {
      label: "Undo",
      onClick: () => {
        removeLastImportedFiles(incoming.length);
        toast(`Reverted ${label}`);
      },
    },
  });
}

export function clearStatements() {
  clearAllData();
  toast("Cleared all imported data");
}

/** Download every imported statement as one JSON backup file. */
export function downloadBackup() {
  const { json, files, fills } = serializeFiles();
  if (files === 0) {
    toast("Nothing to download yet");
    return;
  }
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pnl-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Downloaded ${files} file${files === 1 ? "" : "s"} · ${fills} fills`);
}
