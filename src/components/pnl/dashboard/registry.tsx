import type { ComponentType } from "react";
import {
  CalendarDays,
  GaugeCircle,
  LayoutGrid,
  LineChart,
  ListTree,
  NotebookPen,
  PanelRightOpen,
} from "lucide-react";
import type { Rect, WidgetId } from "./types";
import type { MinSize } from "./grid";
import {
  CalendarView,
  DayDetailView,
  EquityWidget,
  JournalReview,
  MetricsGrid,
  PeriodNav,
  SummaryStats,
  TickerBreakdown,
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
    icon: PanelRightOpen,
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
    id: "calendar",
    title: "Calendar",
    icon: CalendarDays,
    Component: CalendarView,
    min: { w: 4, h: 4 },
    default: { x: 0, y: 3, w: 8, h: 6 },
  },
  {
    id: "dayDetail",
    title: "Day detail",
    icon: PanelRightOpen,
    Component: DayDetailView,
    min: { w: 3, h: 3 },
    default: { x: 8, y: 3, w: 4, h: 6 },
  },
  {
    id: "equity",
    title: "Equity curve",
    icon: LineChart,
    Component: EquityWidget,
    min: { w: 3, h: 2 },
    default: { x: 0, y: 9, w: 5, h: 3 },
  },
  {
    id: "metrics",
    title: "Metrics",
    icon: LayoutGrid,
    Component: MetricsGrid,
    min: { w: 4, h: 2 },
    default: { x: 5, y: 9, w: 7, h: 3 },
  },
  {
    id: "tickers",
    title: "Ticker P&L",
    icon: ListTree,
    Component: TickerBreakdown,
    min: { w: 4, h: 4 },
    default: { x: 0, y: 12, w: 6, h: 6 },
  },
  {
    id: "journal",
    title: "Journal review",
    icon: NotebookPen,
    Component: JournalReview,
    min: { w: 4, h: 4 },
    default: { x: 6, y: 12, w: 6, h: 6 },
  },
];

export const WIDGET_BY_ID: Record<WidgetId, WidgetDef> = Object.fromEntries(
  WIDGETS.map((w) => [w.id, w]),
) as Record<WidgetId, WidgetDef>;

export const MIN_SIZES: Record<string, MinSize> = Object.fromEntries(
  WIDGETS.map((w) => [w.id, w.min]),
);
