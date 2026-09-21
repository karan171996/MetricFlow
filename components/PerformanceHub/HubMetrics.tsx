"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Globe, Clock, AlertTriangle } from "lucide-react";

export function HubMetrics() {
  const metrics = [
    {
      label: "Total Tracked Pages",
      value: "24",
      icon: <Globe className="h-4 w-4 text-[#3ee0a1]" />,
    },
    {
      label: "Avg Global Load Time",
      value: "1.2s",
      icon: <Clock className="h-4 w-4 text-[#06b6d4]" />,
    },
    {
      label: "Total Errors (24h)",
      value: "84",
      icon: <AlertTriangle className="h-4 w-4 text-[#ef4444]" />,
    },
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
