"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, Clock, Zap } from "lucide-react";
import type { MetricsPage } from "@/lib/metricsHistory";
import { formatDuration } from "@/lib/formatDuration";

export function PerformanceKPIs({ page }: { page: MetricsPage }) {
  const { newRelic } = page;
  const kpis = [
    { label: "Average Load Time", value: formatDuration(newRelic.loadTime), icon: <Clock className="h-4 w-4 text-[#3ee0a1]" /> },
    { label: "Error Rate", value: `${newRelic.errorRate.toFixed(2)}%`, icon: <Activity className="h-4 w-4 text-[#ef4444]" /> },
    { label: "Traffic Volume", value: page.visitors, icon: <Zap className="h-4 w-4 text-[#06b6d4]" /> },
  ];

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
