"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, Clock, Zap } from "lucide-react";
import type { MetricsPage } from "@/lib/metricsHistory";
import type { Capability } from "@/lib/tools";
import { formatDuration } from "@/lib/formatDuration";

/** One KPI per capability; a KPI nobody provides is left out. */
export function PerformanceKPIs({ page, has }: { page: MetricsPage; has: (cap: Capability) => boolean }) {
  const m = page.metrics;
  const kpis = [
    { needs: "loadTime" as const, label: "Average Load Time", value: m.loadTime === undefined ? "—" : formatDuration(m.loadTime), icon: <Clock className="h-4 w-4 text-[#3ee0a1]" /> },
    { needs: "errorRate" as const, label: "Error Rate", value: m.errorRate === undefined ? "—" : `${m.errorRate.toFixed(2)}%`, icon: <Activity className="h-4 w-4 text-[#ef4444]" /> },
    { needs: "traffic" as const, label: "Traffic Volume", value: page.visitors, icon: <Zap className="h-4 w-4 text-[#06b6d4]" /> },
  ].filter((k) => has(k.needs));

  return (
    <div className="grid gap-6 md:grid-cols-3 mb-8">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="border-[#2d3748] bg-[#1a202c] shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-400">{kpi.label}</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0f1419] border border-[#2d3748]">
                {kpi.icon}
              </div>
            </div>
            <span className="text-3xl font-bold text-white tracking-tight">{kpi.value}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
