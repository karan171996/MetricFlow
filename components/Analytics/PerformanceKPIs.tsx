"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUp, ArrowDown, Activity, Clock, Zap } from "lucide-react";

export function PerformanceKPIs() {
  const kpis = [
    {
      label: "Average Load Time",
      value: "845ms",
      change: "-45ms (Fast)",
      isPositive: true,
      icon: <Clock className="h-4 w-4 text-[#3ee0a1]" />
    },
    {
      label: "Error Rate (5xx)",
      value: "0.12%",
      change: "+0.02% (Warning)",
      isPositive: false,
      icon: <Activity className="h-4 w-4 text-[#ef4444]" />
    },
    {
      label: "Traffic Volume",
      value: "142k",
      change: "+12k (+8%)",
      isPositive: true,
      icon: <Zap className="h-4 w-4 text-[#06b6d4]" />
    }
  ];

  return (
    <div className="grid gap-6 md:grid-cols-3 mb-8">
      {kpis.map((kpi, i) => (
        <Card key={i} className="border-[#2d3748] bg-[#1a202c] shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-400">{kpi.label}</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0f1419] border border-[#2d3748]">
                {kpi.icon}
              </div>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-white tracking-tight">{kpi.value}</span>
              <div className={`flex items-center text-xs font-medium ${kpi.isPositive ? 'text-[#3ee0a1]' : 'text-[#ef4444]'}`}>
                {kpi.isPositive ? <ArrowUp className="mr-1 h-3 w-3" /> : <ArrowDown className="mr-1 h-3 w-3" />}
                <span>{kpi.change}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
