import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Download, Upload, X } from "lucide-react";
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
  removeImportedFile,
  setCommissions,
  undoRemoveFile,
  useCommissions,
  useDataset,
  useImportedFiles,
} from "@/lib/pnlStore";
import { clearStatements, downloadCsv, importStatements } from "@/lib/import";

const LINKS = [
  { to: "/", label: "Home", exact: true },
  { to: "/tickers", label: "Ticker P/L", exact: false },
  { to: "/blog", label: "Blog", exact: false },
] as const;

// Plain text, no pill — same crispness as the bare icons on the right.
const navLink = "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";
const navLinkActive = "text-sm font-medium text-foreground";

export function NavBar() {
  const data = useDataset();
  const comm = useCommissions();
  const files = useImportedFiles();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="flex h-14 w-full items-center justify-between gap-4 px-4 sm:px-6">
        <nav className="flex items-center gap-4">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: l.exact }}
              className={navLink}
              activeProps={{ className: navLinkActive }}
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
              void importStatements(e.target.files);
              e.target.value = "";
            }}
          />

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" title="Import / manage data">
                <Upload />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-3">
              <Button size="sm" className="w-full" onClick={() => inputRef.current?.click()}>
                <Upload /> Import new file
              </Button>

              {files.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Undo previous files
                  </p>
                  <ul className="space-y-1">
                    {files.map((f, i) => (
                      <li
                        key={`${f.name}-${i}`}
                        className="flex items-center gap-2 rounded-md bg-secondary/50 py-1 pl-2 pr-1 text-xs"
                      >
                        <span className="min-w-0 flex-1 truncate" title={f.name}>
                          {f.name}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {f.fills} fills
                        </span>
                        <button
                          onClick={() => {
                            removeImportedFile(i);
                            toast(`Removed ${f.name}`, {
                              duration: 12000,
                              action: {
                                label: "Undo",
                                onClick: () => {
                                  undoRemoveFile();
                                  toast(`Restored ${f.name}`);
                                },
                              },
                            });
                          }}
                          title={`Remove ${f.name}`}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-loss/20 hover:text-loss"
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-border pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Broker commissions
                  <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal">
                    Used when the statement has no commission column.
                  </span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
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
              </div>

              {data && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="w-full border-t border-border pt-3 text-left text-xs text-muted-foreground hover:text-loss">
                      Clear all imported data
                    </button>
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
                      <AlertDialogAction onClick={clearStatements}>
                        Clear everything
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </PopoverContent>
          </Popover>

          {data && (
            <Button
              variant="ghost"
              size="icon"
              title="Download all fills (.csv)"
              onClick={downloadCsv}
            >
              <Download />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
