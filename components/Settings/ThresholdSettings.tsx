"use client";

import React from "react";
import { setThresholds, useThresholds } from "@/lib/useThresholds";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Activity } from "lucide-react";

export function ThresholdSettings() {
  const t = useThresholds();
  const loadThreshold = [t.loadSeconds];
  const errorThreshold = [t.errorPercent];
  const uptimeSLA = [t.uptimeSLA];

  return (
    <Card className="border-[#2d3748] bg-[#1a202c] shadow-md">
      <CardHeader>
        <CardTitle className="text-[18px] font-bold text-white tracking-tight flex items-center gap-2">
          <Activity className="h-5 w-5 text-gray-400" />
          Performance Thresholds
        </CardTitle>
        <CardDescription className="text-sm text-gray-400">
          Set the boundaries that will trigger &quot;Warning&quot; or &quot;Critical&quot; statuses in your dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8 max-w-2xl">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-gray-300 text-sm">Load Time Threshold (Seconds)</Label>
            <span className="text-[#3ee0a1] font-mono text-sm">{loadThreshold[0]}s</span>
          </div>
          <Slider 
            value={loadThreshold} 
            onValueChange={(val) => setThresholds({ loadSeconds: (val as number[])[0] })} 
            max={5} 
            step={0.1}
            className="cursor-pointer"
          />
          <p className="text-xs text-gray-500">Alert triggers if average load time exceeds this value.</p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-gray-300 text-sm">Error Rate Threshold (%)</Label>
            <span className="text-[#ef4444] font-mono text-sm">{errorThreshold[0]}%</span>
          </div>
          <Slider 
            value={errorThreshold} 
            onValueChange={(val) => setThresholds({ errorPercent: (val as number[])[0] })} 
            max={10} 
            step={0.5}
            className="cursor-pointer"
          />
          <p className="text-xs text-gray-500">Alert triggers if percentage of 5xx errors exceeds this value.</p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-gray-300 text-sm">Uptime SLA Target (%)</Label>
            <span className="text-[#06b6d4] font-mono text-sm">{uptimeSLA[0]}%</span>
          </div>
          <Slider 
            value={uptimeSLA} 
            onValueChange={(val) => setThresholds({ uptimeSLA: (val as number[])[0] })} 
            min={90}
            max={100} 
            step={0.01}
            className="cursor-pointer"
          />
          <p className="text-xs text-gray-500">Your desired target uptime SLA for the month.</p>
        </div>
      </CardContent>
    </Card>
  );
}
