import type { ComponentType } from "react";
import {
  CalendarDays,
  GaugeCircle,
  LayoutGrid,
  LineChart,
  NotebookPen,
  ScrollText,
  SlidersHorizontal,
} from "lucide-react";
import type { Rect, WidgetId } from "./types";
import type { MinSize } from "./grid";
import {
  CalendarView,
  DailyDigestWidget,
  JournalReview,
  MarketWidget,
  MetricsGrid,
  PeriodNav,
  SummaryStats,
} from "./parts";

export type WidgetDef = {
  id: WidgetId;
  title: string;
  icon: ComponentType<{ className?: string }>;
  Component: ComponentType;
  min: MinSize;
  /** Where it sits the first time it's shown. */
  default: Rect;
  /** Hidden until the user adds it from the palette. */
  hiddenByDefault?: boolean;
};

/**
 * Defaults below are written in the old coarse 12-column units; the grid now
 * runs on a 4x-finer ~quarter-inch grid (grid.tsx COLS = 48), so scale up.
 */
const S = 4;
const rect = (x: number, y: number, w: number, h: number): Rect => ({
  x: x * S,
  y: y * S,
  w: w * S,
  h: h * S,
});
const min = (w: number, h: number): MinSize => ({ w: w * S, h: h * S });

export const WIDGETS: WidgetDef[] = [
  {
    id: "periodNav",
    title: "Period",
    icon: SlidersHorizontal,
    Component: PeriodNav,
    min: min(4, 1),
    default: rect(0, 0, 12, 1),
  },
  {
    id: "summary",
    title: "Period summary",
    icon: GaugeCircle,
    Component: SummaryStats,
    min: min(3, 1),
    default: rect(0, 1, 12, 2),
  },
  {
    id: "digest",
    title: "Daily digest",
    icon: ScrollText,
    Component: DailyDigestWidget,
    min: min(2, 4),
    default: rect(0, 3, 3, 7),
  },
  {
    id: "calendar",
    title: "Calendar",
    icon: CalendarDays,
    Component: CalendarView,
    min: min(4, 4),
    default: rect(3, 3, 6, 7),
  },
  {
    id: "equity",
    title: "Equity / Tickers",
    icon: LineChart,
    Component: MarketWidget,
    min: min(3, 4),
    default: rect(9, 3, 3, 7),
  },
  {
    id: "metrics",
    title: "Metrics",
    icon: LayoutGrid,
    Component: MetricsGrid,
    min: min(4, 2),
    default: rect(0, 10, 7, 3),
  },
  {
    id: "journal",
    title: "Journal review",
    icon: NotebookPen,
    Component: JournalReview,
    min: min(4, 4),
    default: rect(7, 10, 5, 7),
  },
];

export const WIDGET_BY_ID: Record<WidgetId, WidgetDef> = Object.fromEntries(
  WIDGETS.map((w) => [w.id, w]),
) as Record<WidgetId, WidgetDef>;

export const MIN_SIZES: Record<string, MinSize> = Object.fromEntries(
  WIDGETS.map((w) => [w.id, w.min]),
);
