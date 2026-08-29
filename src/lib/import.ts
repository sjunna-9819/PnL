import { toast } from "sonner";
import { parseStatement } from "@/lib/pnl";
import {
  addImportedFiles,
  clearAllData,
  removeLastImportedFiles,
  type ImportedFile,
} from "@/lib/pnlStore";

/** Parse dropped/selected broker CSVs and append them as imported files. */
export async function importStatements(fileList: FileList | null) {
  if (!fileList?.length) return;
  const incoming: ImportedFile[] = [];

  for (const file of Array.from(fileList)) {
    const parsed = parseStatement(await file.text(), file.name);
    incoming.push({ name: file.name, fills: parsed.fills, official: parsed.officialDayPnl });
  }

  const added = incoming.reduce((s, f) => s + f.fills.length, 0);
  if (added === 0) {
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
