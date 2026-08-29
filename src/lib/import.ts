import { toast } from "sonner";
import { buildDataset, parseStatement, type Dataset, type Fill } from "@/lib/pnl";
import {
  clearImportUndo,
  getCommissions,
  setDataset,
  snapshotBeforeImport,
  undoLastImport,
} from "@/lib/pnlStore";

/** Parse dropped/selected broker CSVs, merge into the existing dataset, and persist. */
export async function importStatements(fileList: FileList | null, existing: Dataset | null) {
  if (!fileList?.length) return;
  const files = Array.from(fileList);
  const all: Fill[] = existing ? [...existing.fills] : [];
  const names = existing ? [...existing.files] : [];
  const official = new Map(existing ? existing.officialDayPnl : []);

  for (const file of files) {
    const text = await file.text();
    const parsed = parseStatement(text, file.name);
    all.push(...parsed.fills);
    for (const [date, bySymbol] of parsed.officialDayPnl) official.set(date, bySymbol);
    names.push(file.name);
  }

  const next = buildDataset(all, names, official, getCommissions());
  const added = next.fills.length - (existing?.fills.length ?? 0);

  if (added <= 0) {
    toast.error("No trades found in that file", {
      description: "Expecting a broker Account Statement export (Thinkorswim / Schwab).",
    });
    return;
  }

  const label =
    files.length === 1 ? (files[0]?.name ?? "the last import") : `${files.length} files`;
  snapshotBeforeImport(label);
  setDataset(next);
  toast.success(`Imported ${added} new fill${added === 1 ? "" : "s"} from ${label}`, {
    description: `${next.closed.length} closed trades matched · ${next.openPositions.length} still open.`,
    duration: 12000,
    action: {
      label: "Undo",
      onClick: () => {
        undoLastImport();
        toast(`Reverted ${label}`);
      },
    },
  });
}

export function clearStatements() {
  clearImportUndo();
  setDataset(null);
  toast("Cleared all imported data");
}
