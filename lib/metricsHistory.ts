import type { NewRelicPageMetrics } from '@/lib/newrelic';
import type { SentryPageErrors } from '@/lib/sentry';
import type { PageStatus } from '@/types';
import type { Capability, ToolId } from '@/lib/tools';

/**
 * One tool's numbers for one page, or the merged view. Every field is named after
 * its capability and is optional: absent means "not provided or not measured".
 * A missing value is never written as 0.
 */
export interface PageMetrics {
  /** `sampled: true` = raw sampled count. Never scaled, never called visitors. */
  traffic?: { count: number; sampled?: true };
  /** p75 page load, ms. */
  loadTime?: number;
  /** 0-1. */
  apdex?: number;
  /** ms, except cls (unitless). Each vital is optional on its own. */
  vitals?: { lcp?: number; cls?: number; inp?: number; ttfb?: number; fid?: number };
  ajax?: { latency: number; failRate: number };
  /** 0-100. */
  errorRate?: number;
  /** A counted capability: `count: 0` is a real zero when the supplier answered. */
  errors?: { count: number; latest: { title: string; count: number; lastSeen: string }[] };
}

/** Capability -> the tool that supplies it for every page. */
export type Sources = Partial<Record<Capability, ToolId>>;

export interface MetricsPage {
  name: string;
  slug: string;
  url: string;
  visitors: string;
  status: PageStatus;
  newRelic: NewRelicPageMetrics;
  /** Absent when Sentry is not connected (never a zero), so screens can leave it out. */
  sentry?: SentryPageErrors;
  recordedAt: string;
}

export interface MetricsSnapshot {
  timestamp: string;
  pages: MetricsPage[];
}

// ponytail: in-memory, single-process rolling buffer — resets on dev server
// restart and isn't shared across serverless instances. Fine for local dev
// trend charts; upgrade to a real store (DB/Redis) for production history.
const MAX_HISTORY = 20;
const history: MetricsSnapshot[] = [];

export function recordSnapshot(pages: MetricsPage[]) {
  history.push({ timestamp: new Date().toISOString(), pages });
  if (history.length > MAX_HISTORY) history.shift();
}

export function getHistory(): MetricsSnapshot[] {
  return history;
}
