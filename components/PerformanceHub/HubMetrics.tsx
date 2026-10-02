"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Globe, Clock, AlertTriangle } from "lucide-react";
import { hasData } from "@/lib/useMetrics";
import type { MetricsPage } from "@/lib/metricsHistory";
import { formatDuration } from "@/lib/formatDuration";

export function HubMetrics({ pages }: { pages: MetricsPage[] }) {
  const live = pages.filter(hasData);
  const avgLoad = live.length ? live.reduce((s, p) => s + p.newRelic.loadTime, 0) / live.length : null;
  const errors = pages.reduce((s, p) => s + p.sentry.errorCount, 0);

  const metrics = [
    { label: "Pages Reporting", value: `${live.length} of ${pages.length}`, icon: <Globe className="h-4 w-4 text-[#3ee0a1]" /> },
    { label: "Avg Load Time", value: avgLoad === null ? "No data yet" : formatDuration(avgLoad), icon: <Clock className="h-4 w-4 text-[#06b6d4]" /> },
    { label: "Open Errors", value: live.length || errors ? String(errors) : "No data yet", icon: <AlertTriangle className="h-4 w-4 text-[#ef4444]" /> },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-3 mb-8 mt-4">
      {metrics.map((m, i) => (
        <Card key={i} className="border-[#2d3748] bg-[#1a202c] shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-400">{m.label}</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0f1419] border border-[#2d3748]">
                {m.icon}
              </div>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-white tracking-tight">{m.value}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
