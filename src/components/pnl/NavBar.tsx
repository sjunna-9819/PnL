import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Settings2, Trash2, Undo2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FeeInput } from "@/components/pnl/shared";
import {
  setCommissions,
  undoLastImport,
  useCommissions,
  useDataset,
  useImportUndoLabel,
} from "@/lib/pnlStore";
import { clearStatements, importStatements } from "@/lib/import";

const LINKS = [
  { to: "/", label: "Home", exact: true },
  { to: "/tickers", label: "Ticker P/L", exact: false },
  { to: "/blog", label: "Blog", exact: false },
] as const;

const baseLink = "rounded-md px-3 py-1.5 text-sm font-medium transition-colors";

export function NavBar() {
  const data = useDataset();
  const comm = useCommissions();
  const undoLabel = useImportUndoLabel();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="flex h-14 w-full items-center justify-between gap-4 px-4 sm:px-6">
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: l.exact }}
              className={`${baseLink} text-muted-foreground hover:text-foreground`}
              activeProps={{ className: `${baseLink} bg-secondary text-foreground` }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            multiple
            className="hidden"
            onChange={(e) => {
              void importStatements(e.target.files, data);
              e.target.value = "";
            }}
          />
          <Button size="sm" onClick={() => inputRef.current?.click()}>
            <Upload /> Import CSVs
          </Button>

          {undoLabel && (
            <Button
              variant="secondary"
              size="sm"
              title={`Undo import of ${undoLabel}`}
              onClick={() => {
                undoLastImport();
                toast(`Reverted ${undoLabel}`);
              }}
            >
              <Undo2 /> Undo import
            </Button>
          )}

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="icon" title="Commission settings">
                <Settings2 />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto max-w-[90vw]">
              <p className="text-xs font-medium tracking-wider text-muted-foreground">
                BROKER COMMISSIONS
                <span className="mt-1 block max-w-xs text-[11px] font-normal normal-case tracking-normal">
                  Used when the statement has no commission column.
                </span>
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <FeeInput
                  label="Per contract"
                  value={comm.perContract}
                  onChange={(v) => setCommissions({ ...comm, perContract: v })}
                />
                <FeeInput
                  label="Per share"
                  value={comm.perShare}
                  onChange={(v) => setCommissions({ ...comm, perShare: v })}
                />
                <FeeInput
                  label="Per trade"
                  value={comm.perTrade}
                  onChange={(v) => setCommissions({ ...comm, perTrade: v })}
                />
              </div>
            </PopoverContent>
          </Popover>

          {data && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="secondary" size="icon" title="Clear all imported data">
                  <Trash2 />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all imported data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Every fill is removed from this browser. Your CSV files are untouched, but
                    you&apos;ll need to re-import them.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction onClick={clearStatements}>Clear everything</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </header>
  );
}
