/**
 * @file types/index.ts
 *
 * Central type registry for the Performance Dashboard.
 *
 * This is the SINGLE SOURCE OF TRUTH for all data shapes used across
 * every card, table, and chart in the app.
 *
 * When connecting real APIs (New Relic / Sentry / Claude), replace the
 * mock data in each component with fetched data that satisfies these
 * interfaces.  The component props are intentionally typed to accept
 * these interfaces directly so swapping mocks for live data requires
 * NO component changes — only the data layer changes.
 *
 * ─── Index ───────────────────────────────────────────────────────────
 *  1. Shared primitives
 *  2. Dashboard KPI cards  (app/page.tsx top row)
 *  3. Web Vitals cards      (TTFB / LCP / CLS)
 *  4. Core Web Vitals trend (LineChartCard)
 *  5. Traffic bar chart     (BarChartCard)
 *  6. AI Suggestions list   (AISuggestionsDonutCard)
 *  7. Visibility Breakdown  (VisibilityBreakdownCard)
 *  8. Page Performance Changes (WhatMovedCard)
 *  9. Performance Hub       (HubMetrics + HubTable)
 * 10. Performance Detail page (PerformanceKPIs, PerformanceCharts,
 *                              HourlyBreakdownTable, RelatedErrorsList)
 * 11. Settings
 * 12. API response envelopes (ready for fetch integration)
 * ─────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────
// 1. Shared Primitives
// ─────────────────────────────────────────────────────────────────────

/** Traffic / health status used throughout tables and badges. */
export type PageStatus = "Healthy" | "Warning" | "Critical";

/** Standard severity for alerts and errors. */
export type Severity = "high" | "medium" | "low" | "Critical" | "Warning" | "Info";

/** A generic time-series data point used by Recharts charts. */
export interface TimeSeriesPoint {
  /** Label shown on the X-axis (e.g. "JAN", "14:00", "1"). */
  label: string;
  /** Numeric Y-axis value. `null` = nothing measured at this point; charts draw a gap. */
  value: number | null;
}

/** A trend direction indicator. */
export type TrendDirection = "up" | "down" | "stable";


// ─────────────────────────────────────────────────────────────────────
// 2. Dashboard KPI Cards  (app/page.tsx — top stat row)
// ─────────────────────────────────────────────────────────────────────

/**
 * One card in the top KPI strip.
 * Maps to the `stats` array in app/page.tsx.
 */
export interface DashboardStatCard {
  /** Display label (e.g. "Avg Response Time"). */
  label: string;
  /** Formatted value string (e.g. "124ms"). */
  value: string;
  /** Human-readable change description (e.g. "-12% from last hour"). */
  change: string;
  /**
   * Tailwind text-color class for the change badge.
   * e.g. "text-dash-success" | "text-dash-warning" | "text-dash-blue"
   */
  changeClass: string;
}


// ─────────────────────────────────────────────────────────────────────
// 3. Web Vitals Cards  (WebVitalCard component)
//    Used for TTFB, LCP, CLS on the dashboard homepage.
// ─────────────────────────────────────────────────────────────────────

/**
 * Props / data contract for a single Web Vital sparkline card.
 * Passed directly as props to <WebVitalCard />.
 */
export interface WebVitalCardData {
  /** Metric short name, shown as card title (e.g. "TTFB", "LCP", "CLS"). */
  title: string;
  /** Full metric name shown as subtitle (e.g. "Time to First Byte"). */
  description: string;
  /** Formatted current value string (e.g. "120ms", "1.2s", "0.12"). */
  value: string;
  /** Formatted change from previous period (e.g. "12ms", "0.04"). */
  change: string;
  /** true = improvement (green arrow up), false = regression (red arrow down). */
  isPositive: boolean;
  /** Hex color used for the sparkline stroke and fill gradient. */
  color: string;
  /** Historical time-series data powering the sparkline chart. */
  data: TimeSeriesPoint[];
}


// ─────────────────────────────────────────────────────────────────────
// 4. Core Web Vitals Score Trend  (LineChartCard)
// ─────────────────────────────────────────────────────────────────────

/**
 * One data point in the monthly CWV trend area chart.
 * Maps to the `data` array inside LineChartCard.
 */
export interface CWVTrendPoint {
  /** Month abbreviation shown on X-axis (e.g. "JAN", "FEB"). */
  month: string;
  /** Aggregate CWV score for that month (0–100). `null` = nothing measured; drawn as a gap. */
  value: number | null;
}

/** Full data contract for the LineChartCard component. */
export interface LineChartCardData {
  title: string;
  points: CWVTrendPoint[];
}


// ─────────────────────────────────────────────────────────────────────
// 5. Traffic Bar Chart  (BarChartCard)
//    Horizontal bar chart — top pages by traffic volume.
// ─────────────────────────────────────────────────────────────────────

/** One bar in the horizontal traffic ranking chart. */
export interface TrafficBarItem {
  /** Page or keyword label shown on Y-axis. */
  name: string;
  /** Monthly traffic / view count (numeric, formatted client-side). */
  value: number;
}

/** Full data contract for the BarChartCard component. */
export interface BarChartCardData {
  title: string;
  items: TrafficBarItem[];
}


// ─────────────────────────────────────────────────────────────────────
// 6. AI Suggestions List  (AISuggestionsDonutCard)
// ─────────────────────────────────────────────────────────────────────

/** Type of AI suggestion — drives the icon and badge color rendered by the component. */
export type AISuggestionType = "warning" | "critical" | "positive" | "optimize";

/**
 * A single AI-generated performance insight for one tracked page.
 * API should return an array of these; the component renders them as a list.
 */
export interface AISuggestion {
  /** Tracked page display name (e.g. "Homepage", "Checkout"). */
  page: string;
  /** Suggestion category — maps to icon and color in the component. */
  type: AISuggestionType;
  /** The actionable insight text generated by Claude / AI. */
  suggestion: string;
  /** Short metric label shown as a badge (e.g. "LCP", "TTFB", "UX"). */
  badge: string;
}

/** Full data contract for the AISuggestionsDonutCard component. */
export interface AISuggestionsCardData {
  suggestions: AISuggestion[];
  /** ISO timestamp of when these suggestions were generated. */
  generatedAt: string;
}


// ─────────────────────────────────────────────────────────────────────
// 7. Visibility (Web Vitals) Breakdown Card  (VisibilityBreakdownCard)
// ─────────────────────────────────────────────────────────────────────

/** A summary stat row shown below the main metric in VisibilityBreakdownCard. */
export interface VisibilityStat {
  /** Row label (e.g. "Pages Passing Core Web Vitals"). */
  label: string;
  /** Formatted fraction or count (e.g. "44/47"). */
  value: string;
  /** Numeric delta shown as a badge (e.g. 18 for "+18"). */
  delta: number;
  /** True = delta is an improvement. */
  isPositive: boolean;
}

/** Full data contract for the VisibilityBreakdownCard component. */
export interface VisibilityBreakdownCardData {
  /** Primary headline metric (avg performance score, 0–100). */
  avgScore: number;
  /** Change vs. previous period. */
  scoreDelta: number;
  isPositive: boolean;
  /** Sparkline trend data powering the background chart. */
  trend: Array<{ value: number | null }>;
  /** Summary stat rows rendered below the chart. */
  stats: VisibilityStat[];
}


// ─────────────────────────────────────────────────────────────────────
// 8. Page Performance Changes  (WhatMovedCard)
//    Gainers and decliners in Core Web Vital scores.
// ─────────────────────────────────────────────────────────────────────

/** A single page entry in the Gainers or Decliners list. */
export interface PageMovement {
  /** Current performance score (0–100). */
  score: string;
  /** Route path (e.g. "/checkout", "/blog/[slug]"). */
  page: string;
  /** Human-readable description of what metric changed (e.g. "LCP 1.4s → 0.9s"). */
  metricChange: string;
  /**
   * Numeric point change (positive = improvement, negative = regression).
   * The component uses Math.abs() for display in the decliners column.
   */
  scoreDelta: number;
  /** Formatted monthly traffic for context (e.g. "8,400 views/mo"). */
  monthlyTraffic: string;
}

/** Full data contract for the WhatMovedCard component. */
export interface WhatMovedCardData {
  /** Pages whose performance improved this period. */
  improved: PageMovement[];
  /** Pages whose performance regressed this period. */
  regressed: PageMovement[];
  /** Period label (e.g. "last 7 days"). */
  period: string;
}


// ─────────────────────────────────────────────────────────────────────
// 9. Performance Hub  (/performance page)
//    HubMetrics (summary cards) + HubTable (page list).
// ─────────────────────────────────────────────────────────────────────

/** A single row in the tracked-pages hub table. */
export interface TrackedPage {
  /** Display name (e.g. "Homepage"). */
  name: string;
  /**
   * URL-safe slug used as the dynamic route segment.
   * Routes to: /performance/[slug]
   */
  slug: string;
  /** Formatted 24h visitor count (e.g. "45.2k"). */
  visitors: string;
  /** Formatted average load time (e.g. "845ms", "1.4s"). */
  avgLoad: string;
  /** Raw error count in the last 24 hours. */
  errors: number;
  /** Overall health status, drives badge color. */
  status: PageStatus;
}

/** Summary metric cards shown above the hub table. */
export interface HubMetric {
  label: string;
  value: string;
}

/** Full data contract for the Performance Hub page. */
export interface PerformanceHubData {
  /** Top-level summary cards (total tracked pages, avg load, total errors). */
  summary: HubMetric[];
  /** All tracked pages rendered in the table. */
  pages: TrackedPage[];
}


// ─────────────────────────────────────────────────────────────────────
// 10. Performance Detail Page  (/performance/[slug])
//     PerformanceKPIs + PerformanceCharts + HourlyBreakdownTable +
//     RelatedErrorsList
// ─────────────────────────────────────────────────────────────────────

/** A single KPI card on the performance detail page. */
export interface PerformanceKPI {
  label: string;
  /** Formatted value (e.g. "845ms", "0.12%", "142k"). */
  value: string;
  /** Formatted change description (e.g. "-45ms (Fast)"). */
  change: string;
  isPositive: boolean;
}

/** One row in the hourly breakdown table. */
export interface HourlyBreakdownRow {
  /** Hour label shown on the row (e.g. "14:00"). */
  hour: string;
  /** Formatted visitor count for that hour. */
  visitors: string;
  /** Error count during that hour. */
  errors: number;
  /** Formatted average load time during that hour. */
  avgLoad: string;
  status: PageStatus;
}

/** One error entry in the Related Errors list. */
export interface RelatedError {
  /** Unique error identifier (e.g. "ERR-9241"). */
  id: string;
  /** Error message or description. */
  message: string;
  /** Human-readable timestamp (e.g. "12:45 PM"). */
  time: string;
  severity: Extract<Severity, "Critical" | "Warning">;
}

/** Chart series data for the Performance Detail page charts. */
export interface PerformanceChartSeries {
  /** Label used for the chart title and legend. */
  name: string;
  /** Time-series data points. */
  data: TimeSeriesPoint[];
}

/** Full data contract for the Performance Detail (/performance/[slug]) page. */
export interface PerformanceDetailData {
  /** The page slug (matches the URL segment). */
  slug: string;
  /** Human-readable page name (e.g. "Homepage"). */
  pageName: string;
  /** URL of the page being monitored. */
  pageUrl: string;
  /** Top-level KPI cards. */
  kpis: PerformanceKPI[];
  /** Load time history chart. */
  loadTimeHistory: PerformanceChartSeries;
  /** Error rate history chart. */
  errorRateHistory: PerformanceChartSeries;
  /** Traffic volume bar chart. */
  trafficVolume: PerformanceChartSeries;
  /** Hourly breakdown table rows. */
  hourlyBreakdown: HourlyBreakdownRow[];
  /** Recent related errors. */
  relatedErrors: RelatedError[];
  /** ISO timestamp of the last data fetch. */
  recordedAt: string;
}


// ─────────────────────────────────────────────────────────────────────
// 11. Settings  (/settings page)
// ─────────────────────────────────────────────────────────────────────

/** A team member entry in the Team Members table. */
export interface TeamMember {
  name: string;
  email: string;
  role: "Admin" | "Developer" | "Viewer";
  status: "Active" | "Invited";
}

/** Performance threshold configuration. */
export interface ThresholdConfig {
  /** Load time warning threshold in seconds. */
  loadTimeSeconds: number;
  /** Error rate warning threshold as a percentage. */
  errorRatePercent: number;
  /** Uptime SLA target as a percentage. */
  uptimePercent: number;
}

/** Notification preferences configuration. */
export interface NotificationConfig {
  emailEnabled: boolean;
  slackEnabled: boolean;
  smsEnabled: boolean;
}

/** An API key entry. */
export interface ApiKey {
  id: string;
  /** Partially masked key for display (e.g. "pk_live_51Mxxx...xxx"). */
  maskedKey: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Full settings data contract for the /settings page. */
export interface SettingsData {
  apiKeys: ApiKey[];
  thresholds: ThresholdConfig;
  notifications: NotificationConfig;
  teamMembers: TeamMember[];
}


// ─────────────────────────────────────────────────────────────────────
// 12. API Response Envelopes
//     Standard wrappers returned by /api/* route handlers.
//     When you build the Next.js API routes, wrap all responses in these.
// ─────────────────────────────────────────────────────────────────────

/**
 * Generic success envelope.
 *
 * @example
 * // In an API route handler:
 * return Response.json({ data: pageData, success: true } satisfies ApiResponse<PerformanceDetailData>)
 */
export interface ApiResponse<T> {
  data: T;
  success: true;
  /** ISO timestamp of when this response was generated. */
  timestamp: string;
}

/**
 * Generic error envelope.
 *
 * @example
 * return Response.json({ error: "Not found", success: false }, { status: 404 })
 */
export interface ApiErrorResponse {
  error: string;
  success: false;
  /** Optional machine-readable error code. */
  code?: string;
}

// ── Convenience union for fetch helpers ────────────────────────────

export type ApiResult<T> = ApiResponse<T> | ApiErrorResponse;

/**
 * Response type for GET /api/metrics
 * Returns aggregated metrics for all tracked pages.
 */
export type MetricsApiResponse = ApiResponse<PerformanceDetailData[]>;

/**
 * Response type for POST /api/analyze
 * Sends metrics to the AI layer and receives suggestions + alerts.
 */
export interface AnalyzeApiRequest {
  metrics: PerformanceDetailData[];
}

export interface AnalyzeApiResponse {
  suggestions: AISuggestion[];
  /** High-level health summary generated by Claude. */
  summary: string;
  /** ISO timestamp. */
  analyzedAt: string;
}
