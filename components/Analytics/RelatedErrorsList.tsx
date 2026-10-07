"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AlertCircle, Clock } from "lucide-react";
import type { MetricsPage } from "@/lib/metricsHistory";

export function RelatedErrorsList({ errors }: { errors: NonNullable<MetricsPage["sentry"]>["latestErrors"] }) {
  return (
    <Card className="border-[#2d3748] bg-[#1a202c] shadow-md w-full lg:w-[400px]">
      <CardHeader>
        <CardTitle className="text-[18px] font-bold text-white tracking-tight flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-[#ef4444]" />
          Related Errors
        </CardTitle>
      </CardHeader>
      <CardContent>
        {errors.length === 0 ? (
          <p className="text-sm text-gray-400">No errors reported for this page.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {errors.map((err) => (
              <div key={err.title} className="flex flex-col gap-2 rounded-lg border border-[#2d3748] bg-[#0f1419] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-gray-500">{err.count} events</span>
                </div>
                <p className="text-sm font-medium text-gray-200 line-clamp-2">{err.title}</p>
                <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                  <Clock className="h-3 w-3" />
                  <span>{new Date(err.lastSeen).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
