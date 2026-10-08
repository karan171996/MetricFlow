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
  /** Absent unless loadTime, errorRate and apdex are all provided. */
  status?: PageStatus;
  /** Merged view: each capability taken from `sources[capability]`. Shared screens read only this. */
  metrics: PageMetrics;
  /** Each connected, non-failed tool's own numbers. */
  byTool: Partial<Record<ToolId, PageMetrics>>;
  recordedAt: string;
  /** @deprecated Removed in C3. No screen may read these. */
  newRelic?: NewRelicPageMetrics;
  /** @deprecated Removed in C3. Absent when Sentry is not connected (never a zero). */
  sentry?: SentryPageErrors;
}

export interface MetricsSnapshot {
  timestamp: string;
  /** Kept with the numbers, so a later change of supplier is not read as a regression. */
  sources: Sources;
  pages: MetricsPage[];
}

/** The /api/metrics body, as lib/legacyMetrics.ts hands it to screens. */
export interface MetricsResponse {
  configured: boolean;
  tools: string[];
  /** Connected tools whose last load failed. Their capabilities are absent, never zero. */
  failed: string[];
  sources: Sources;
  project?: string;
  pages: MetricsPage[];
  history: MetricsSnapshot[];
  timestamp: string;
}

// ponytail: in-memory, single-process rolling buffer — resets on dev server
// restart and isn't shared across serverless instances. Fine for local dev
// trend charts; upgrade to a real store (DB/Redis) for production history.
const MAX_HISTORY = 20;
const history: MetricsSnapshot[] = [];

export function recordSnapshot(pages: MetricsPage[], sources: Sources) {
  history.push({ timestamp: new Date().toISOString(), sources, pages });
  if (history.length > MAX_HISTORY) history.shift();
}

export function getHistory(): MetricsSnapshot[] {
  return history;
}
