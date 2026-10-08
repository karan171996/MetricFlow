import type { PageStatus } from "@/types";
import type { PageMetrics } from "@/lib/metricsHistory";

export interface Thresholds {
  loadSeconds: number;
  errorPercent: number;
  uptimeSLA: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { loadSeconds: 1.5, errorPercent: 2, uptimeSLA: 99.9 };

/** Warning above a threshold, Critical above 2x it. No status at all unless load time, error rate and Apdex are all provided. */
export function deriveStatus(m: PageMetrics, t: Thresholds): PageStatus | undefined {
  if (m.loadTime === undefined || m.errorRate === undefined || m.apdex === undefined) return undefined;
  const loadRatio = m.loadTime / 1000 / t.loadSeconds;
  const errRatio = m.errorRate / t.errorPercent;
  if (loadRatio > 2 || errRatio > 2) return "Critical";
  if (loadRatio > 1 || errRatio > 1 || m.apdex < 0.9) return "Warning";
  return "Healthy";
}
