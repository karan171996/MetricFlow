// Re-export from analytics for backward compatibility
export type { SentryPageErrors } from '@/lib/analytics/SentryAnalytics';

export const EMPTY_SENTRY_DATA = {
  errorCount: 0,
  errorRate: 0,
  warningCount: 0,
  latestErrors: []
} as const;
