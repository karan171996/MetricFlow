import type { PageStatus } from "@/types";
import type { NewRelicPageMetrics } from "@/lib/newrelic";

export interface Thresholds {
  loadSeconds: number;
  errorPercent: number;
  uptimeSLA: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { loadSeconds: 1.5, errorPercent: 2, uptimeSLA: 99.9 };

/** Warning above a threshold, Critical above 2x it. */
export function deriveStatus(nr: NewRelicPageMetrics, t: Thresholds): PageStatus {
  const loadRatio = nr.loadTime / 1000 / t.loadSeconds;
  const errRatio = nr.errorRate / t.errorPercent;
  if (loadRatio > 2 || errRatio > 2) return "Critical";
  if (loadRatio > 1 || errRatio > 1 || nr.apdexScore < 0.9) return "Warning";
  return "Healthy";
}
