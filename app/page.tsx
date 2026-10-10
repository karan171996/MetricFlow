"use client";

import { useEffect, useRef, useState } from "react";
import { AppSidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/header";
import { DashboardBodySkeleton } from "@/components/Skeletons";
import {
  LineChartCard,
  AISuggestionsDonutCard,
  BarChartCard,
  VisibilityBreakdownCard,
  WebVitalCard
} from "@/components/DashboardCharts";
import { HubTable } from "@/components/PerformanceHub";
import { ThresholdAlert } from "@/components/header/ThresholdAlert";
import {
  computeStats,
  computeWebVitals,
  computeVisibilityBreakdown,
  computeCwvTrend,
  alertsToSuggestions
} from "@/lib/dashboardTransforms";
import { EmptyState } from "@/components/EmptyState";
import { hasData, provides } from "@/lib/useMetrics";
import { useThresholds } from "@/lib/useThresholds";
import { withNeutralShape } from "@/lib/legacyMetrics";
import type { AnalysisUnavailable } from "@/lib/aiAnalysis";
import type { MetricsResponse } from "@/lib/metricsHistory";
import type { Capability } from "@/lib/tools";
import type { PageStatus, TrafficBarItem } from "@/types";

interface AnalysisResponse {
  status?: "ok";
  analysis?: string;
  alerts?: { severity: "high" | "medium" | "low"; page: string; message: string; metric: string }[];
  recommendations?: string[];
}

const REFRESH_INTERVAL_MS = 30000;
/** Status colours only (DESIGN.md): a tile value over its threshold takes the status colour; a Healthy one stays white. */
const STATUS_CLASS: Partial<Record<PageStatus, string>> = { Warning: "text-dash-warning", Critical: "text-dash-danger" };
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
  const thresholds = useThresholds();
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState<AnalysisUnavailable["reason"] | null>(null);
  const [apiTimings, setApiTimings] = useState<TrafficBarItem[]>([]);
  const [timingsFailed, setTimingsFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  /** The last load of /api/metrics failed. Timings and the AI analysis never set this: each fails inside its own card. */
  const [error, setError] = useState(false);

  // Loads can overlap (a slow one is still waiting when the next 30s refresh starts). Only the newest may
  // write state, so an older success never hides a newer failure or puts older numbers back.
  const latestLoad = useRef(0);
  const analysisFailed = useRef(false);

  async function fetchData() {
    const load = ++latestLoad.current;
    const stale = () => load !== latestLoad.current;
    try {
      setRefreshing(true);

      const metricsRes = await fetch("/api/metrics");
      // A failed read answers { error }: thrown here, so the last good data stays instead of becoming "not configured".
      if (!metricsRes.ok) throw new Error(`HTTP ${metricsRes.status}`);
      const metricsData = withNeutralShape(await metricsRes.json());
      if (stale()) return;
      setMetrics(metricsData);
      setError(false);

      // MetricFlow's own timings: a failure stays inside that card. It is not a dashboard error and does not
      // stop the analysis below. The card keeps its last good bars; the next refresh tries again.
      try {
        const timingsRes = await fetch("/api/timings");
        if (!timingsRes.ok) throw new Error(`HTTP ${timingsRes.status}`);
        const timingsData: { items?: TrafficBarItem[] } = await timingsRes.json();
        if (!Array.isArray(timingsData?.items)) throw new Error("no items in the reply");
        if (stale()) return;
        setApiTimings(timingsData.items);
        setTimingsFailed(false);
      } catch (err) {
        console.error("Error fetching API timings:", err);
        if (stale()) return;
        setTimingsFailed(true);
      }

      // The same for the analysis: a rejected fetch or a body that is not JSON is "unavailable" in the AI card,
      // not a stale dashboard. Only the error is logged, never the request.
      try {
        if (metricsData.configured && !analysisFailed.current && shouldRunAnalysis()) {
          const analysisRes = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ metrics: { pages: metricsData.pages } })
          });
          // A non-OK answer ({ error }) counts as unavailable too. A 200 without a status is a real reply.
          const analysisData: AnalysisResponse | AnalysisUnavailable = analysisRes.ok
            ? await analysisRes.json()
            : { status: "unavailable", reason: "provider_error" };
          if (stale()) return;
          if (analysisData.status === "unavailable") {
            setAiUnavailable(analysisData.reason);
            // A failed call is tried again on the next page load, not on each 30s refresh. A missing key costs no call.
            analysisFailed.current = analysisData.reason !== "no_key";
          } else {
            setAnalysis(analysisData);
            setAiUnavailable(null);
            // Only a real reply counts as the day's run.
            markAnalysisRan();
          }
        }
      } catch (err) {
        console.error("Error fetching AI analysis:", err);
        if (stale()) return;
        setAiUnavailable("provider_error");
        analysisFailed.current = true;
      }
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
      if (!stale()) setError(true);
    } finally {
      if (!stale()) setRefreshing(false);
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
          {/* The first load failed: an error with Retry only, not an endless skeleton or the setup prompt. */}
          {error && !refreshing ? (
            <div className="flex flex-1 flex-col p-6 md:p-8">
              <EmptyState title="Could not load metrics" reason="Failed to load live data." href={null} onRetry={fetchData} />
            </div>
          ) : (
            <DashboardBodySkeleton />
          )}
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
              <EmptyState />
            ) : (
              <EmptyState title="Connect your data" reason="Add your New Relic or Sentry keys to see real numbers." href="/setup" cta="Set up keys" />
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }
  // A card whose capability no connected tool provides is left out, never drawn with zeros.
  const has = (cap: Capability) => provides(metrics, cap);
  const stats = computeStats(pages, history, has, thresholds);
  const webVitals = computeWebVitals(pages, history, has);
  const visibility = computeVisibilityBreakdown(pages, history, has, thresholds);
  const cwvTrend = computeCwvTrend(history, has);
  const suggestions = alertsToSuggestions(analysis);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-dash-surface">
        <Header />
        <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col p-6 md:p-8">
          {error && (
            <div role="status" className="mb-4 rounded-lg border border-dash-warning/40 bg-dash-warning/10 px-4 py-2 text-body-sm text-dash-warning">
              Could not load the latest data.
              {metrics.timestamp && ` Showing numbers from ${new Date(metrics.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`}
              {refreshing && <span className="ml-2 text-dash-muted">Retrying…</span>}
            </div>
          )}

          {/* What to fix first, then what to do about it. Both rank and judge with lib/thresholds.ts, as the tiles and the breakdown below do. */}
          <ThresholdAlert pages={pages} thresholds={thresholds} />
          <HubTable title="Fix first" pages={pages} has={has} thresholds={thresholds} failed={metrics.failed} limit={5} />
          <div className="mt-6">
            <AISuggestionsDonutCard suggestions={suggestions} unavailable={aiUnavailable} />
          </div>

          {/* Site-wide numbers rank nothing, so they sit below the table. */}
          <h2 className="mt-8 mb-4 text-h3 text-dash-foreground">Across all pages</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-dash-border bg-dash-card p-5"
              >
                <p className="text-label text-dash-muted">{stat.label}</p>
                <p className={`mt-2 text-h2 ${(stat.status && STATUS_CLASS[stat.status]) ?? "text-dash-foreground"}`}>
                  {stat.value}{stat.status && " "}
                  {/* The word and the limit carry the status too, so colour is never the only signal. */}
                  {stat.status && (
                    <span className="ml-2 text-body-sm text-dash-muted">
                      {stat.status} · {stat.limit}
                    </span>
                  )}
                </p>
                <p className={`mt-1 text-body-sm ${stat.changeClass}`}>
                  {stat.change}
                </p>
              </div>
            ))}
          </div>

          {webVitals && (
            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <WebVitalCard {...webVitals.ttfb} />
              <WebVitalCard {...webVitals.lcp} />
              <WebVitalCard {...webVitals.cls} />
            </div>
          )}

          {/* One grid: a card left out by capability leaves no gap. */}
          <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {cwvTrend && <LineChartCard {...cwvTrend} />}
            {visibility && <VisibilityBreakdownCard {...visibility} />}
            <BarChartCard title="MetricFlow API response times" items={apiTimings} failed={timingsFailed} />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
