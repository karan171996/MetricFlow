import type { MetricsPage, MetricsSnapshot } from '@/lib/metricsHistory';
import type { Capability } from '@/lib/tools';
import type {
  DashboardStatCard,
  WebVitalCardData,
  VisibilityBreakdownCardData,
  WhatMovedCardData,
  PageMovement,
  AISuggestion,
  TimeSeriesPoint,
  LineChartCardData
} from '@/types';
import { formatDuration } from '@/lib/formatDuration';

/** Is this capability provided right now? Each builder returns only the cards it can fill (see `provides` in lib/useMetrics.ts). */
type Has = (cap: Capability) => boolean;

/** Average of the values that are present. A missing value is skipped, never counted as 0. */
function avg(values: (number | undefined)[]): number {
  const present = values.filter((v): v is number => v !== undefined);
  if (!present.length) return 0;
  return present.reduce((sum, v) => sum + v, 0) / present.length;
}

const NO_PRIOR = 'No prior data yet';
const NEUTRAL_COLOR = '#9ca3af';

function buildChange(current: number, previous: number | null, higherIsBetter: boolean) {
  if (previous === null || previous === 0) {
    return { change: NO_PRIOR, changeClass: 'text-dash-muted' };
  }
  const delta = current - previous;
  const pct = (delta / previous) * 100;
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  const sign = pct > 0 ? '+' : '';
  return {
    change: `${sign}${pct.toFixed(1)}% from last check`,
    changeClass: delta === 0 ? 'text-dash-blue' : improved ? 'text-dash-success' : 'text-dash-warning'
  };
}

function previousPages(history: MetricsSnapshot[]): MetricsPage[] | null {
  return history.length >= 2 ? history[history.length - 2].pages : null;
}

/** True when the traffic numbers are a sampled count (Sentry tracing), not every page view. */
export const isSampled = (pages: MetricsPage[]) => pages.some(p => p.metrics.traffic?.sampled);
const traffic = (pages: MetricsPage[]) => pages.reduce((sum, p) => sum + (p.metrics.traffic?.count ?? 0), 0);
const score = (p: MetricsPage) => (p.metrics.apdex === undefined ? undefined : p.metrics.apdex * 100);

export function computeStats(pages: MetricsPage[], history: MetricsSnapshot[], has: Has): DashboardStatCard[] {
  const prev = previousPages(history);

  const loadTime = avg(pages.map(p => p.metrics.loadTime));
  const errorRate = avg(pages.map(p => p.metrics.errorRate));
  const throughput = traffic(pages);
  const apdex = avg(pages.map(p => p.metrics.apdex));

  const prevLoadTime = prev ? avg(prev.map(p => p.metrics.loadTime)) : null;
  const prevErrorRate = prev ? avg(prev.map(p => p.metrics.errorRate)) : null;
  const prevThroughput = prev ? traffic(prev) : null;
  const prevApdex = prev ? avg(prev.map(p => p.metrics.apdex)) : null;

  return [
    has('loadTime') && {
      label: 'Avg Page Load Time',
      value: formatDuration(loadTime),
      ...buildChange(loadTime, prevLoadTime, false)
    },
    has('errorRate') && {
      label: 'Error Rate',
      value: `${errorRate.toFixed(2)}%`,
      ...buildChange(errorRate, prevErrorRate, false)
    },
    has('traffic') && {
      // A sampled count is shown as it is: never scaled up, never called throughput or visitors.
      label: isSampled(pages) ? 'Sampled page loads (24h)' : 'Page views (24h)',
      value: throughput.toLocaleString(),
      ...buildChange(throughput, prevThroughput, true)
    },
    has('apdex') && {
      label: 'Apdex Score',
      value: apdex.toFixed(2),
      ...buildChange(apdex, prevApdex, true)
    }
  ].filter((card): card is DashboardStatCard => Boolean(card));
}

/** A snapshot where no page has the value is `null`, which the charts draw as a gap, not as 0. */
function sparkline(history: MetricsSnapshot[], pick: (p: MetricsPage) => number | undefined): TimeSeriesPoint[] {
  return history.map((snapshot, i) => {
    const values = snapshot.pages.map(pick);
    return { label: String(i + 1), value: values.some(v => v !== undefined) ? avg(values) : null };
  });
}

/**
 * Same null convention as `buildChange`: no previous snapshot, or one with no value for the vital (an average of 0), is no baseline.
 * The arrow follows the direction of change; for these vitals a decrease is the good one.
 */
function vitalChange(current: number, previous: number | null, format: (v: number) => string) {
  if (previous === null || previous === 0) return { change: NO_PRIOR, direction: null, isPositive: null, color: NEUTRAL_COLOR };
  const delta = current - previous;
  // A change too small to show at the card's precision is not drawn as a "0ms" move.
  if (format(Math.abs(delta)) === format(0)) return { change: 'No change', direction: null, isPositive: null, color: NEUTRAL_COLOR };
  return {
    change: format(Math.abs(delta)),
    direction: delta < 0 ? ('down' as const) : ('up' as const),
    isPositive: delta < 0,
    color: delta < 0 ? '#3ee0a1' : '#ef4444'
  };
}

export function computeWebVitals(
  pages: MetricsPage[],
  history: MetricsSnapshot[],
  has: Has
): { ttfb: WebVitalCardData; lcp: WebVitalCardData; cls: WebVitalCardData } | null {
  if (!has('vitals')) return null;
  const prev = previousPages(history);
  const ttfb = avg(pages.map(p => p.metrics.vitals?.ttfb));
  const lcp = avg(pages.map(p => p.metrics.vitals?.lcp));
  const cls = avg(pages.map(p => p.metrics.vitals?.cls));
  const prevTtfb = prev ? avg(prev.map(p => p.metrics.vitals?.ttfb)) : null;
  const prevLcp = prev ? avg(prev.map(p => p.metrics.vitals?.lcp)) : null;
  const prevCls = prev ? avg(prev.map(p => p.metrics.vitals?.cls)) : null;

  return {
    ttfb: {
      title: 'TTFB',
      description: 'Time to First Byte',
      value: formatDuration(ttfb),
      ...vitalChange(ttfb, prevTtfb, formatDuration),
      data: sparkline(history, p => p.metrics.vitals?.ttfb)
    },
    lcp: {
      title: 'LCP',
      description: 'Largest Contentful Paint',
      value: formatDuration(lcp),
      ...vitalChange(lcp, prevLcp, formatDuration),
      data: sparkline(history, p => p.metrics.vitals?.lcp)
    },
    cls: {
      title: 'CLS',
      description: 'Cumulative Layout Shift',
      value: cls.toFixed(2),
      ...vitalChange(cls, prevCls, v => v.toFixed(2)),
      data: sparkline(history, p => p.metrics.vitals?.cls)
    }
  };
}

/** The chart plots Apdex, so that is the capability it needs. */
export function computeCwvTrend(history: MetricsSnapshot[], has: Has): LineChartCardData | null {
  if (!has('apdex')) return null;
  return {
    title: 'Apdex Trend',
    points: sparkline(history, score).map((point, i) => ({
      month: new Date(history[i].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: point.value === null ? null : Math.round(point.value)
    }))
  };
}

const CWV_APDEX_THRESHOLD = 0.9;
const LOAD_BUDGET_MS = 1000;
// A page with no value for the metric does not pass.
const passesCwv = (p: MetricsPage) => p.metrics.apdex !== undefined && p.metrics.apdex >= CWV_APDEX_THRESHOLD;
const inBudget = (p: MetricsPage) => p.metrics.loadTime !== undefined && p.metrics.loadTime <= LOAD_BUDGET_MS;

export function computeVisibilityBreakdown(
  pages: MetricsPage[],
  history: MetricsSnapshot[],
  has: Has
): VisibilityBreakdownCardData | null {
  if (!has('apdex') || !has('loadTime')) return null;
  const prev = previousPages(history);

  const avgScore = avg(pages.map(p => p.metrics.apdex)) * 100;
  const passingCwv = pages.filter(passesCwv).length;
  const withinBudget = pages.filter(inBudget).length;

  // Same null convention as `buildChange`: no previous snapshot, or one without the metric (an average of 0), gives no delta.
  const prevApdex = prev && avg(prev.map(p => p.metrics.apdex));
  const prevLoadTime = prev && avg(prev.map(p => p.metrics.loadTime));
  const scoreDelta = prev && prevApdex ? Math.round((avgScore - prevApdex * 100) * 10) / 10 : null;
  const passingDelta = prev && prevApdex ? passingCwv - prev.filter(passesCwv).length : null;
  const budgetDelta = prev && prevLoadTime ? withinBudget - prev.filter(inBudget).length : null;

  return {
    avgScore: Math.round(avgScore * 10) / 10,
    scoreDelta,
    isPositive: scoreDelta !== null && scoreDelta >= 0,
    trend: sparkline(history, score).map(p => ({ value: p.value })),
    stats: [
      {
        label: 'Pages with Apdex 0.9 or higher',
        value: `${passingCwv}/${pages.length}`,
        delta: passingDelta,
        isPositive: passingDelta !== null && passingDelta >= 0
      },
      {
        label: 'Pages Within Load Budget',
        value: `${withinBudget}/${pages.length}`,
        delta: budgetDelta,
        isPositive: budgetDelta !== null && budgetDelta >= 0
      }
    ]
  };
}

/**
 * Needs two snapshots to diff. Real page-by-page deltas — no fabricated
 * gainers/decliners before the in-memory history buffer has anything to
 * compare against.
 */
export function computeWhatMoved(pages: MetricsPage[], history: MetricsSnapshot[], has: Has): WhatMovedCardData | null {
  if (!has('pages') || !has('apdex') || !has('loadTime')) return null;
  if (history.length < 2) {
    return { improved: [], regressed: [], period: 'not enough history yet — check back shortly' };
  }

  const baseline = history[0].pages;
  const improved: PageMovement[] = [];
  const regressed: PageMovement[] = [];

  pages.forEach(page => {
    const before = baseline.find(b => b.url === page.url);
    if (!before || before.metrics.apdex === undefined || page.metrics.apdex === undefined) return;

    const scoreBefore = Math.round(before.metrics.apdex * 100);
    const scoreAfter = Math.round(page.metrics.apdex * 100);
    const scoreDelta = scoreAfter - scoreBefore;
    if (scoreDelta === 0) return;

    const movement: PageMovement = {
      score: String(scoreAfter),
      page: page.url,
      // formatDuration prints "—" for a load time that is not there.
      metricChange: `Load ${formatDuration(before.metrics.loadTime ?? NaN)} → ${formatDuration(page.metrics.loadTime ?? NaN)}`,
      scoreDelta,
      monthlyTraffic: page.visitors
    };

    (scoreDelta > 0 ? improved : regressed).push(movement);
  });

  improved.sort((a, b) => b.scoreDelta - a.scoreDelta);
  regressed.sort((a, b) => a.scoreDelta - b.scoreDelta);

  return { improved, regressed, period: `since ${new Date(history[0].timestamp).toLocaleTimeString()}` };
}

interface Alert {
  severity: 'high' | 'medium' | 'low';
  page: string;
  message: string;
  metric: string;
}

interface AnalysisResult {
  alerts?: Alert[];
  recommendations?: string[];
}

const SEVERITY_TO_TYPE: Record<Alert['severity'], AISuggestion['type']> = {
  high: 'critical',
  medium: 'warning',
  low: 'warning'
};

const BADGE_MAX_LENGTH = 14;

// AI-generated alerts aren't guaranteed to follow the "short label" prompt
// instruction — cap it here so the badge UI never overflows regardless of
// what any LLM actually returns.
function toBadgeLabel(metric: string): string {
  const firstWord = metric.split(/[\s,]/)[0];
  return firstWord.length > BADGE_MAX_LENGTH ? `${firstWord.slice(0, BADGE_MAX_LENGTH)}…` : firstWord;
}

export function alertsToSuggestions(analysis: AnalysisResult | null): AISuggestion[] {
  if (!analysis) return [];

  const fromAlerts: AISuggestion[] = (analysis.alerts ?? []).map(alert => ({
    page: alert.page,
    type: SEVERITY_TO_TYPE[alert.severity],
    suggestion: alert.message,
    badge: toBadgeLabel(alert.metric)
  }));

  const fromRecommendations: AISuggestion[] = (analysis.recommendations ?? []).map(text => ({
    page: 'All Pages',
    type: 'optimize',
    suggestion: text,
    badge: 'Tip'
  }));

  return [...fromAlerts, ...fromRecommendations];
}
