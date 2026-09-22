import type { NewRelicPageMetrics } from '@/lib/newrelic';
import type { SentryPageErrors } from '@/lib/sentry';
import type { PageStatus } from '@/types';

export interface MetricsPage {
  name: string;
  slug: string;
  url: string;
  visitors: string;
  status: PageStatus;
  newRelic: NewRelicPageMetrics;
  sentry: SentryPageErrors;
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
