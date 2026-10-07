"use client";

import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/header";
import { DashboardBodySkeleton } from "@/components/Skeletons";
import {
  LineChartCard,
  AISuggestionsDonutCard,
  BarChartCard,
  VisibilityBreakdownCard,
  WhatMovedCard,
  WebVitalCard
} from "@/components/DashboardCharts";
import {
  computeStats,
  computeWebVitals,
  computeVisibilityBreakdown,
  computeWhatMoved,
  computeCwvTrend,
  alertsToSuggestions
} from "@/lib/dashboardTransforms";
import { EmptyState } from "@/components/EmptyState";
import { hasData, NEEDS_NEW_RELIC } from "@/lib/useMetrics";
import type { MetricsPage, MetricsSnapshot } from "@/lib/metricsHistory";
import type { TrafficBarItem } from "@/types";

interface MetricsResponse {
  configured: boolean;
  tools?: string[];
  pages: MetricsPage[];
  history: MetricsSnapshot[];
  timestamp: string;
}

interface AnalysisResponse {
  analysis?: string;
  alerts?: { severity: "high" | "medium" | "low"; page: string; message: string; metric: string }[];
  recommendations?: string[];
}

const REFRESH_INTERVAL_MS = 30000;
const ANALYZE_INTERVAL_MS = 24 * 60 * 60 * 1000; // Gemini call: at most once/day for now
const LAST_ANALYZED_KEY = "dashboard:lastAnalyzedAt";

function shouldRunAnalysis(): boolean {
  try {
    const last = localStorage.getItem(LAST_ANALYZED_KEY);
    return !last || Date.now() - Number(last) >= ANALYZE_INTERVAL_MS;
  } catch {
    return true;
  }
}

function markAnalysisRan() {
  try {
    localStorage.setItem(LAST_ANALYZED_KEY, String(Date.now()));
  } catch {
    // localStorage unavailable (private mode, etc.) — falls back to running every fetch
  }
}

export default function Home() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [apiTimings, setApiTimings] = useState<TrafficBarItem[]>([]);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchData() {
    try {
      setRefreshing(true);

      const metricsRes = await fetch("/api/metrics");
      const metricsData: MetricsResponse = await metricsRes.json();
      setMetrics(metricsData);

      const timingsRes = await fetch("/api/timings");
      const timingsData: { items: TrafficBarItem[] } = await timingsRes.json();
      setApiTimings(timingsData.items);

      if (metricsData.configured && shouldRunAnalysis()) {
        const analysisRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metrics: { pages: metricsData.pages } })
        });
        const analysisData: AnalysisResponse = await analysisRes.json();
        setAnalysis(analysisData);
        markAnalysisRan();
      }

      setError(null);
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
      setError("Failed to load live data.");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate fetch-on-mount + poll
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  if (!metrics) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-dash-surface">
          <Header />
          <DashboardBodySkeleton />
        </SidebarInset>
      </SidebarProvider>
    );
  }

  const { pages, history } = metrics;
  if (!metrics.configured || !pages.some(hasData)) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-dash-surface">
          <Header />
          <div className="flex flex-1 flex-col p-6 md:p-8">
            {metrics.configured ? (
              <EmptyState {...(metrics.tools?.includes("new-relic") === false ? NEEDS_NEW_RELIC : {})} />
            ) : (
              <EmptyState title="Connect your data" reason="Add your New Relic or Sentry keys to see real numbers." href="/setup" cta="Set up keys" />
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }
  const stats = computeStats(pages, history);
  const webVitals = computeWebVitals(pages, history);
  const visibility = computeVisibilityBreakdown(pages, history);
  const whatMoved = computeWhatMoved(pages, history);
  const cwvTrend = computeCwvTrend(history);
  const suggestions = alertsToSuggestions(analysis);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-dash-surface">
        <Header />
        <div className="flex flex-1 flex-col p-6 md:p-8">
          {error && (
            <div className="mb-4 rounded-lg border border-dash-warning/40 bg-dash-warning/10 px-4 py-2 text-body-sm text-dash-warning">
              {error}
              {refreshing && <span className="ml-2 text-dash-muted">Retrying…</span>}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-dash-border bg-dash-card p-5"
              >
                <p className="text-label text-dash-muted">{stat.label}</p>
                <p className="mt-2 text-h2 text-dash-foreground">{stat.value}</p>
                <p className={`mt-1 text-body-sm ${stat.changeClass}`}>
                  {stat.change}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <div className="flex flex-col gap-6 xl:col-span-2">
              <div className="grid gap-6 md:grid-cols-3">
                <WebVitalCard {...webVitals.ttfb} />
                <WebVitalCard {...webVitals.lcp} />
                <WebVitalCard {...webVitals.cls} />
              </div>
              <WhatMovedCard {...whatMoved} />
              <LineChartCard {...cwvTrend} />
            </div>

            <div className="flex flex-col gap-6">
              <VisibilityBreakdownCard {...visibility} />
              <AISuggestionsDonutCard suggestions={suggestions} />
              <BarChartCard title="Rankings Moved" items={apiTimings} />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
