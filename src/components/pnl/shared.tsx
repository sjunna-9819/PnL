import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InstrumentKind } from "@/lib/pnl";

/** Direction glyph so profit/loss is not conveyed by color alone. */
export function TrendArrow({ tone, className }: { tone: number; className?: string }) {
  if (tone > 0) return <ArrowUpRight className={cn("size-4 text-profit", className)} aria-hidden />;
  if (tone < 0) return <ArrowDownRight className={cn("size-4 text-loss", className)} aria-hidden />;
  return null;
}

export function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-5" title={hint}>
      <p
        className={cn(
          "flex items-center gap-1 text-2xl font-bold",
          tone !== undefined && tone > 0 && "text-profit",
          tone !== undefined && tone < 0 && "text-loss",
        )}
      >
        {tone !== undefined && <TrendArrow tone={tone} className="size-5" />}
        {value}
      </p>
      <p className="mt-1 text-xs font-medium tracking-wider text-muted-foreground">
        {label.toUpperCase()}
      </p>
    </div>
  );
}

export function FeeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="text-xs text-muted-foreground">
      <span className="block">{label}</span>
      <span className="mt-1 flex items-center gap-1 rounded-lg bg-secondary/60 px-2 py-1 text-sm text-foreground">
        $
        <input
          type="number"
          min={0}
          step="0.01"
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="w-20 bg-transparent outline-none"
        />
      </span>
    </label>
  );
}

export function KindBadge({ kind }: { kind: InstrumentKind }) {
  const map = {
    call: { text: "C", cls: "bg-profit/20 text-profit", title: "Call option" },
    put: { text: "P", cls: "bg-loss/20 text-loss", title: "Put option" },
    stock: { text: "Stock", cls: "bg-secondary text-foreground", title: "Stock" },
  } as const;
  const m = map[kind];
  return (
    <span
      title={m.title}
      className={cn(
        "inline-flex min-w-6 items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-bold",
        m.cls,
      )}
    >
      {m.text}
    </span>
  );
}
