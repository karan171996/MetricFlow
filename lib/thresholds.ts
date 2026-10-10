import type { PageStatus } from "@/types";
import type { MetricsPage, PageMetrics } from "@/lib/metricsHistory";
import { formatDuration } from "@/lib/formatDuration";

export interface Thresholds {
  loadSeconds: number;
  errorPercent: number;
  /** Lowest Apdex (0-1) that still counts as healthy. */
  apdexMin: number;
  uptimeSLA: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { loadSeconds: 1.5, errorPercent: 2, apdexMin: 0.9, uptimeSLA: 99.9 };

/** The three metrics a threshold applies to. */
export type ThresholdMetric = "loadTime" | "errorRate" | "apdex";
const METRICS: ThresholdMetric[] = ["loadTime", "errorRate", "apdex"];

/**
 * How far a value is past its limit: above 1 is over it, above 2 is over twice it. The one formula behind
 * `metricStatus` and the ranking. Apdex runs the other way (lower is worse), so it is limit / value.
 * 0/0 and NaN count as 0 (not over); a zero limit under a real value gives Infinity. A negative Apdex is read as 0.
 */
export function overageRatio(metric: ThresholdMetric, value: number, t: Thresholds): number {
  const ratio = metric === "loadTime" ? value / 1000 / t.loadSeconds : metric === "errorRate" ? value / t.errorPercent : t.apdexMin / Math.max(value, 0);
  return Number.isNaN(ratio) ? 0 : ratio;
}

/**
 * The one health rule, for one metric: Warning above its threshold, Critical above 2x it.
 * Apdex is Warning below its minimum and has no Critical step. A missing value has no status.
 */
export function metricStatus(metric: ThresholdMetric, value: number | undefined, t: Thresholds): PageStatus | undefined {
  if (value === undefined) return undefined;
  const ratio = overageRatio(metric, value, t);
  return ratio > 2 && metric !== "apdex" ? "Critical" : ratio > 1 ? "Warning" : "Healthy";
}

/** The limit as shown beside a value, e.g. "limit 1.5s", "limit 2%", "min 0.9". */
export function limitLabel(metric: ThresholdMetric, t: Thresholds): string {
  if (metric === "apdex") return `min ${+t.apdexMin.toFixed(2)}`;
  return metric === "loadTime" ? `limit ${+t.loadSeconds.toFixed(1)}s` : `limit ${+t.errorPercent.toFixed(2)}%`;
}

/** A page's status is its worst metric. No status at all unless load time, error rate and Apdex are all provided. */
export function deriveStatus(m: PageMetrics, t: Thresholds): PageStatus | undefined {
  const all = [metricStatus("loadTime", m.loadTime, t), metricStatus("errorRate", m.errorRate, t), metricStatus("apdex", m.apdex, t)];
  if (all.includes(undefined)) return undefined;
  return all.includes("Critical") ? "Critical" : all.includes("Warning") ? "Warning" : "Healthy";
}

/** A page that has never reported has no beacon hit: show "No data yet", never 0ms/Healthy. */
export function hasData(p: Pick<MetricsPage, "metrics">): boolean {
  const m = p.metrics;
  return (m.traffic?.count ?? 0) > 0 || (m.loadTime ?? 0) > 0 || (m.errors?.count ?? 0) > 0;
}

/** New Relic's numbers for a listed page it has no row for are zeros, not measurements (the route's emptyPage). Only a page with a view or a load time is judged. */
export function hasPerformance(p: Pick<MetricsPage, "metrics">): boolean {
  return (p.metrics.traffic?.count ?? 0) > 0 || (p.metrics.loadTime ?? 0) > 0;
}

const count = (v: number | undefined) => (Number.isFinite(v) ? (v as number) : 0);

/**
 * Worst first, for the "Fix first" and "All pages" tables. Each page comes back with its `status` set by
 * `deriveStatus` (never the one in the response); a page with no data, or with only unmeasured zeros, has none.
 * Groups: Critical, Warning, errors but no status, Healthy, no status and no errors, no data.
 * Inside a group: worst overage ratio, then Sentry errors, then traffic (all descending), then name, then slug.
 */
export function rankPages(pages: MetricsPage[], t: Thresholds): MetricsPage[] {
  const rows = pages.map((page) => {
    const live = hasData(page);
    const status = hasPerformance(page) ? deriveStatus(page.metrics, t) : undefined;
    const errors = count(page.metrics.errors?.count);
    const group = !live ? 5 : status === "Critical" ? 0 : status === "Warning" ? 1 : status === "Healthy" ? 3 : errors > 0 ? 2 : 4;
    // Only a page with a status has a ratio: without all three inputs there is nothing to rank by.
    const ratio = status ? Math.max(...METRICS.map((k) => overageRatio(k, page.metrics[k]!, t))) : 0;
    return { page: { ...page, status }, group, ratio, errors, traffic: count(page.metrics.traffic?.count) };
  });
  // Infinity - Infinity is NaN, which is falsy: two zero-limit breaches fall through to the next tie-break.
  rows.sort((a, b) =>
    a.group - b.group || b.ratio - a.ratio || b.errors - a.errors || b.traffic - a.traffic ||
    a.page.name.localeCompare(b.page.name) || (a.page.slug < b.page.slug ? -1 : a.page.slug > b.page.slug ? 1 : 0));
  return rows.map((r) => r.page);
}

const REASON: Record<ThresholdMetric, (v: number) => string> = {
  loadTime: (v) => `load time ${formatDuration(v)}`,
  errorRate: (v) => `error rate ${v.toFixed(2)}%`,
  apdex: (v) => `Apdex ${v.toFixed(2)}`,
};

/** Every metric of the page that is over its limit, worst ratio first, e.g. "load time 3.1s (limit 1.5s)". Feeds the banner and the table's small-screen line. */
export function breachReasons(page: Pick<MetricsPage, "metrics">, t: Thresholds): string[] {
  const m = page.metrics;
  if (!hasPerformance(page)) return []; // unmeasured zeros are not a breach (Apdex 0 would read as one)
  return METRICS
    .filter((k) => ["Warning", "Critical"].includes(metricStatus(k, m[k], t) ?? ""))
    .sort((a, b) => overageRatio(b, m[b]!, t) - overageRatio(a, m[a]!, t) || 0)
    .map((k) => `${REASON[k](m[k]!)} (${limitLabel(k, t)})`);
}
