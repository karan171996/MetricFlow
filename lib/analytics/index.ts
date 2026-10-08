import 'server-only';
import type { ToolId } from '@/lib/tools';
import { Analytics } from '@/lib/analytics/Analytics';
import { NewRelicAnalytics } from '@/lib/analytics/NewRelicAnalytics';
import { SentryAnalytics } from '@/lib/analytics/SentryAnalytics';

export { Analytics, type ToolRead, type ToolUpdate, type Polled, type KeyResult } from '@/lib/analytics/Analytics';
export { NewRelicAnalytics, type NewRelicPageMetrics } from '@/lib/analytics/NewRelicAnalytics';
export { SentryAnalytics, type SentryPageErrors } from '@/lib/analytics/SentryAnalytics';

/** The server half of every tool in TOOLS. A tool id with no entry here is a compile error. */
export const SERVER_TOOLS = {
  'new-relic': new NewRelicAnalytics(),
  sentry: new SentryAnalytics()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} satisfies Record<ToolId, Analytics<any, any>>;
