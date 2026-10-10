"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, Clock, Gauge, OctagonAlert, TriangleAlert, Zap } from "lucide-react";
import type { MetricsPage } from "@/lib/metricsHistory";
import type { Capability } from "@/lib/tools";
import { formatDuration } from "@/lib/formatDuration";
import { isSampled } from "@/lib/dashboardTransforms";
import { hasPerformance, limitLabel, metricStatus, type ThresholdMetric, type Thresholds } from "@/lib/thresholds";

/** One KPI per capability; a KPI nobody provides is left out. Load time, error rate and Apdex show their limit and, when over it, an icon and "over limit". */
export function PerformanceKPIs({ page, has, thresholds }: { page: MetricsPage; has: (cap: Capability) => boolean; thresholds: Thresholds }) {
  const m = page.metrics;
  // Without a view or a load time, New Relic's numbers are unmeasured zeros: dashes, never "0ms" or a judgement.
  const measured = hasPerformance(page);
  const num = (v: number | undefined, fmt: (n: number) => string) => (measured && v !== undefined ? fmt(v) : "—");
  const kpis: { needs: Capability; label: string; value: string | number; icon: React.ReactNode; limit?: ThresholdMetric }[] = [
    { needs: "loadTime", label: "Average Load Time", value: num(m.loadTime, formatDuration), icon: <Clock className="h-4 w-4 text-[#3ee0a1]" />, limit: "loadTime" },
    { needs: "errorRate", label: "Error Rate", value: num(m.errorRate, (n) => `${n.toFixed(2)}%`), icon: <Activity className="h-4 w-4 text-[#ef4444]" />, limit: "errorRate" },
    { needs: "apdex", label: "Apdex", value: num(m.apdex, (n) => n.toFixed(2)), icon: <Gauge className="h-4 w-4 text-[#3ee0a1]" />, limit: "apdex" },
    { needs: "traffic", label: isSampled([page]) ? "Page loads (sampled)" : "Traffic Volume", value: measured && m.traffic ? page.visitors : "—", icon: <Zap className="h-4 w-4 text-[#06b6d4]" /> },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-3 mb-8">
      {kpis.filter((k) => has(k.needs)).map((kpi) => {
        const status = kpi.limit && measured ? metricStatus(kpi.limit, m[kpi.limit], thresholds) : undefined;
        const over = status === "Warning" || status === "Critical";
        const Over = status === "Critical" ? OctagonAlert : TriangleAlert;
        return (
          <Card key={kpi.label} className="border-[#2d3748] bg-[#1a202c] shadow-md">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-gray-400">{kpi.label}</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0f1419] border border-[#2d3748]">
                  {kpi.icon}
                </div>
              </div>
              <span data-over-limit={over || undefined} className="text-3xl font-semibold text-white tracking-tight">
                {over && <Over aria-hidden="true" className={`mr-2 inline size-6 align-[-2px] ${status === "Critical" ? "text-dash-danger" : "text-dash-warning"}`} />}
                {kpi.value}
                {over && <span className="sr-only"> over limit</span>}
              </span>
              {kpi.limit && <span className="mt-1 block text-body-sm text-dash-muted">{limitLabel(kpi.limit, thresholds)}</span>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
