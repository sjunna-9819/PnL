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

export const WIDGETS: WidgetDef[] = [
  {
    id: "periodNav",
    title: "Period",
    icon: SlidersHorizontal,
    Component: PeriodNav,
    min: { w: 4, h: 1 },
    default: { x: 0, y: 0, w: 12, h: 1 },
  },
  {
    id: "summary",
    title: "Period summary",
    icon: GaugeCircle,
    Component: SummaryStats,
    min: { w: 3, h: 1 },
    default: { x: 0, y: 1, w: 12, h: 2 },
  },
  {
    id: "digest",
    title: "Daily digest",
    icon: ScrollText,
    Component: DailyDigestWidget,
    min: { w: 2, h: 4 },
    default: { x: 0, y: 3, w: 3, h: 7 },
  },
  {
    id: "calendar",
    title: "Calendar",
    icon: CalendarDays,
    Component: CalendarView,
    min: { w: 4, h: 4 },
    default: { x: 3, y: 3, w: 6, h: 7 },
  },
  {
    id: "equity",
    title: "Equity / Tickers",
    icon: LineChart,
    Component: MarketWidget,
    min: { w: 3, h: 4 },
    default: { x: 9, y: 3, w: 3, h: 7 },
  },
  {
    id: "metrics",
    title: "Metrics",
    icon: LayoutGrid,
    Component: MetricsGrid,
    min: { w: 4, h: 2 },
    default: { x: 0, y: 10, w: 7, h: 3 },
  },
  {
    id: "journal",
    title: "Journal review",
    icon: NotebookPen,
    Component: JournalReview,
    min: { w: 4, h: 4 },
    default: { x: 7, y: 10, w: 5, h: 7 },
  },
];

export const WIDGET_BY_ID: Record<WidgetId, WidgetDef> = Object.fromEntries(
  WIDGETS.map((w) => [w.id, w]),
) as Record<WidgetId, WidgetDef>;

export const MIN_SIZES: Record<string, MinSize> = Object.fromEntries(
  WIDGETS.map((w) => [w.id, w.min]),
);
