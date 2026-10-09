import type { PageStatus } from "@/types";
import type { PageMetrics } from "@/lib/metricsHistory";

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

/**
 * The one health rule, for one metric: Warning above its threshold, Critical above 2x it.
 * Apdex is Warning below its minimum and has no Critical step. A missing value has no status.
 */
export function metricStatus(metric: ThresholdMetric, value: number | undefined, t: Thresholds): PageStatus | undefined {
  if (value === undefined) return undefined;
  if (metric === "apdex") return value < t.apdexMin ? "Warning" : "Healthy";
  const ratio = metric === "loadTime" ? value / 1000 / t.loadSeconds : value / t.errorPercent;
  return ratio > 2 ? "Critical" : ratio > 1 ? "Warning" : "Healthy";
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
