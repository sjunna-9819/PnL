import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useDataset } from "@/lib/pnlStore";
import { dailyTotals, type Dataset, type DayTotal } from "@/lib/pnl";

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayKey() {
  const t = new Date();
  return iso(t.getFullYear(), t.getMonth(), t.getDate());
}

type View = "month" | "year";

type DashCtx = {
  data: Dataset | null;
  totals: Map<string, DayTotal>;
  cursor: Date;
  setCursor: (d: Date) => void;
  view: View;
  setView: (v: View) => void;
  selected: string | null;
  setSelected: (d: string | null) => void;
  today: string;
  /** "YYYY-MM" in month view, "YYYY" in year view. */
  period: string;
  isCurrentPeriod: boolean;
};

const Ctx = createContext<DashCtx | null>(null);

export function useDash(): DashCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDash must be used inside <DashProvider>");
  return c;
}

/**
 * Shared trading-view state for every widget on the dashboard — the calendar
 * cursor, month/year mode and the selected day — plus the dataset and its
 * per-day totals computed once.
 */
export function DashProvider({
  initialDay,
  children,
}: {
  initialDay?: string | undefined;
  children: ReactNode;
}) {
  const data = useDataset();
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<View>("month");
  const [selected, setSelected] = useState<string | null>(null);
  const today = todayKey();

  const totals = useMemo<Map<string, DayTotal>>(
    () => (data ? dailyTotals(data) : new Map()),
    [data],
  );

  const newestDate = data ? (data.fills[data.fills.length - 1]?.date ?? null) : null;
  const hasInitialDay = !!(initialDay && data?.fills.some((f) => f.date === initialDay));
  const initedRef = useRef(false);

  // On first data load jump to the requested day (deep link from /tickers), and
  // whenever a later statement is imported jump to its newest day.
  useEffect(() => {
    if (!newestDate) return;
    const target = !initedRef.current && hasInitialDay ? initialDay! : newestDate;
    initedRef.current = true;
    const [y, m] = target.split("-").map(Number);
    setCursor(new Date(y!, m! - 1, 1));
    setSelected(target);
  }, [newestDate, initialDay, hasInitialDay]);

  const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
  const period = view === "month" ? monthKey : String(cursor.getFullYear());
  const isCurrentPeriod = today.startsWith(period);

  const value = useMemo<DashCtx>(
    () => ({
      data,
      totals,
      cursor,
      setCursor,
      view,
      setView,
      selected,
      setSelected,
      today,
      period,
      isCurrentPeriod,
    }),
    [data, totals, cursor, view, selected, today, period, isCurrentPeriod],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
