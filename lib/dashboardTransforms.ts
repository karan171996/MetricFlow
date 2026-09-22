import type { MetricsPage, MetricsSnapshot } from '@/lib/metricsHistory';
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

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function buildChange(current: number, previous: number | null, higherIsBetter: boolean) {
  if (previous === null || previous === 0) {
    return { change: 'No prior data yet', changeClass: 'text-dash-muted' };
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

export function computeStats(pages: MetricsPage[], history: MetricsSnapshot[]): DashboardStatCard[] {
  const prev = previousPages(history);

  const loadTime = avg(pages.map(p => p.newRelic.loadTime));
  const errorRate = avg(pages.map(p => p.newRelic.errorRate));
  const throughput = pages.reduce((sum, p) => sum + p.newRelic.throughput, 0);
  const apdex = avg(pages.map(p => p.newRelic.apdexScore));

  const prevLoadTime = prev ? avg(prev.map(p => p.newRelic.loadTime)) : null;
  const prevErrorRate = prev ? avg(prev.map(p => p.newRelic.errorRate)) : null;
  const prevThroughput = prev ? prev.reduce((sum, p) => sum + p.newRelic.throughput, 0) : null;
  const prevApdex = prev ? avg(prev.map(p => p.newRelic.apdexScore)) : null;

  return [
    {
      label: 'Avg Response Time',
      value: `${Math.round(loadTime)}ms`,
      ...buildChange(loadTime, prevLoadTime, false)
    },
    {
      label: 'Error Rate',
      value: `${errorRate.toFixed(2)}%`,
      ...buildChange(errorRate, prevErrorRate, false)
    },
    {
      label: 'Throughput',
      value: `${(throughput / 1000).toFixed(1)}k/s`,
      ...buildChange(throughput, prevThroughput, true)
    },
    {
      label: 'Apdex Score',
      value: apdex.toFixed(2),
      ...buildChange(apdex, prevApdex, true)
    }
  ];
}

function sparkline(history: MetricsSnapshot[], pick: (p: MetricsPage) => number): TimeSeriesPoint[] {
  return history.map((snapshot, i) => ({
    label: String(i + 1),
    value: avg(snapshot.pages.map(pick))
  }));
}

export function computeWebVitals(
  pages: MetricsPage[],
  history: MetricsSnapshot[]
): { ttfb: WebVitalCardData; lcp: WebVitalCardData; cls: WebVitalCardData } {
  const prev = previousPages(history);
  const ttfb = avg(pages.map(p => p.newRelic.ttfb));
  const lcp = avg(pages.map(p => p.newRelic.lcp));
  const cls = avg(pages.map(p => p.newRelic.cls));
  const prevTtfb = prev ? avg(prev.map(p => p.newRelic.ttfb)) : ttfb;
  const prevLcp = prev ? avg(prev.map(p => p.newRelic.lcp)) : lcp;
  const prevCls = prev ? avg(prev.map(p => p.newRelic.cls)) : cls;

  return {
    ttfb: {
      title: 'TTFB',
      description: 'Time to First Byte',
      value: `${Math.round(ttfb)}ms`,
      change: `${Math.abs(Math.round(ttfb - prevTtfb))}ms`,
      isPositive: ttfb <= prevTtfb,
      color: ttfb <= prevTtfb ? '#3ee0a1' : '#ef4444',
      data: sparkline(history, p => p.newRelic.ttfb)
    },
    lcp: {
      title: 'LCP',
      description: 'Largest Contentful Paint',
      value: `${(lcp / 1000).toFixed(1)}s`,
      change: `${Math.abs((lcp - prevLcp) / 1000).toFixed(1)}s`,
      isPositive: lcp <= prevLcp,
      color: lcp <= prevLcp ? '#3ee0a1' : '#ef4444',
      data: sparkline(history, p => p.newRelic.lcp)
    },
    cls: {
      title: 'CLS',
      description: 'Cumulative Layout Shift',
      value: cls.toFixed(2),
      change: Math.abs(cls - prevCls).toFixed(2),
      isPositive: cls <= prevCls,
      color: cls <= prevCls ? '#3ee0a1' : '#ef4444',
      data: sparkline(history, p => p.newRelic.cls)
    }
  };
}

export function computeCwvTrend(history: MetricsSnapshot[]): LineChartCardData {
  return {
    title: 'Core Web Vitals Score Trend',
    points: history.map(snapshot => ({
      month: new Date(snapshot.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: Math.round(avg(snapshot.pages.map(p => p.newRelic.apdexScore * 100)))
    }))
  };
}

const CWV_APDEX_THRESHOLD = 0.9;
const LOAD_BUDGET_MS = 1000;

export function computeVisibilityBreakdown(
  pages: MetricsPage[],
  history: MetricsSnapshot[]
): VisibilityBreakdownCardData {
  const prev = previousPages(history);

  const avgScore = avg(pages.map(p => p.newRelic.apdexScore)) * 100;
  const prevAvgScore = prev ? avg(prev.map(p => p.newRelic.apdexScore)) * 100 : avgScore;

  const passingCwv = pages.filter(p => p.newRelic.apdexScore >= CWV_APDEX_THRESHOLD).length;
  const prevPassingCwv = prev ? prev.filter(p => p.newRelic.apdexScore >= CWV_APDEX_THRESHOLD).length : passingCwv;

  const withinBudget = pages.filter(p => p.newRelic.loadTime <= LOAD_BUDGET_MS).length;
  const prevWithinBudget = prev ? prev.filter(p => p.newRelic.loadTime <= LOAD_BUDGET_MS).length : withinBudget;

  return {
    avgScore: Math.round(avgScore * 10) / 10,
    scoreDelta: Math.round((avgScore - prevAvgScore) * 10) / 10,
    isPositive: avgScore >= prevAvgScore,
    trend: sparkline(history, p => p.newRelic.apdexScore * 100).map(p => ({ value: p.value })),
    stats: [
      {
        label: 'Pages Passing Core Web Vitals',
        value: `${passingCwv}/${pages.length}`,
        delta: passingCwv - prevPassingCwv,
        isPositive: passingCwv >= prevPassingCwv
      },
      {
        label: 'Pages Within Load Budget',
        value: `${withinBudget}/${pages.length}`,
        delta: withinBudget - prevWithinBudget,
        isPositive: withinBudget >= prevWithinBudget
      }
    ]
  };
}

/**
 * Needs two snapshots to diff. Real page-by-page deltas — no fabricated
 * gainers/decliners before the in-memory history buffer has anything to
 * compare against.
 */
export function computeWhatMoved(pages: MetricsPage[], history: MetricsSnapshot[]): WhatMovedCardData {
  if (history.length < 2) {
    return { improved: [], regressed: [], period: 'not enough history yet — check back shortly' };
  }

  const baseline = history[0].pages;
  const improved: PageMovement[] = [];
  const regressed: PageMovement[] = [];

  pages.forEach(page => {
    const before = baseline.find(b => b.url === page.url);
    if (!before) return;

    const scoreBefore = Math.round(before.newRelic.apdexScore * 100);
    const scoreAfter = Math.round(page.newRelic.apdexScore * 100);
    const scoreDelta = scoreAfter - scoreBefore;
    if (scoreDelta === 0) return;

    const movement: PageMovement = {
      score: String(scoreAfter),
      page: page.url,
      metricChange: `Load ${Math.round(before.newRelic.loadTime)}ms → ${Math.round(page.newRelic.loadTime)}ms`,
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
