"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { ArrowUp, ArrowDown, MoreHorizontal, Gauge, Zap } from "lucide-react";
import type { VisibilityBreakdownCardData } from "@/types";

/** No arrow and muted text when there is nothing to compare with (`null`) or nothing moved (0). */
const deltaText = (delta: number | null) => (delta === null ? "No prior data yet" : delta === 0 ? "No change" : Math.abs(delta));

export function VisibilityBreakdownCard({
  avgScore,
  scoreDelta,
  isPositive,
  trend,
  stats
}: VisibilityBreakdownCardData) {
  return (
    <Card className="w-full min-w-[350px] flex-1 rounded-xl border-[#2d3748] bg-[#1a202c] shadow-[0_4px_6px_rgba(0,0,0,0.3)]">
      <CardHeader className="flex flex-row items-center justify-between p-6 pb-4">
        <div>
          <CardTitle className="text-[18px] font-bold text-white tracking-tight">Web Vitals Breakdown</CardTitle>
          <CardDescription className="text-[13px] text-gray-400 mt-1">
            Core Web Vitals across your tracked pages
          </CardDescription>
        </div>
        <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#2d3748] bg-[#0f1419] text-gray-400 hover:text-white transition-colors">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </CardHeader>
      
      <CardContent className="flex flex-col gap-4 p-6 pt-0">
        {/* Avg Position Box */}
        <div className="relative overflow-hidden rounded-xl border border-[#2d3748] bg-[#0f1419] p-5 flex flex-col justify-between h-[150px]">
          <div className="flex items-center gap-2 text-gray-300 relative z-10">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10">
              <Gauge className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-medium">Avg Apdex (x100)</span>
          </div>
          <div className="mt-2 flex items-end justify-between relative z-10">
            <span className="text-[40px] font-bold leading-none tracking-tight text-white">{avgScore}</span>
            <div className={`flex items-center text-sm font-medium ${!scoreDelta ? "text-muted-foreground" : isPositive ? "text-[#3ee0a1]" : "text-[#ef4444]"}`}>
              {!!scoreDelta && (isPositive ? <ArrowUp className="mr-1 h-3.5 w-3.5" /> : <ArrowDown className="mr-1 h-3.5 w-3.5" />)}
              <span>{deltaText(scoreDelta)}</span>
            </div>
          </div>
          {/* Mini Chart Background */}
          <div className="absolute bottom-0 right-0 h-24 w-2/3 pointer-events-none">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3ee0a1" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#3ee0a1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke="#3ee0a1" strokeWidth={2} fill="url(#colorAvg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className="flex items-center justify-between rounded-xl border border-[#2d3748] bg-[#0f1419] p-4 transition-colors hover:bg-white/5 cursor-pointer"
          >
            <div className="flex items-center gap-3 text-gray-300">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/5">
                {i === 0 ? <Zap className="h-4 w-4" /> : <Gauge className="h-4 w-4" />}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-400">{stat.label}</span>
                <span className="text-lg font-bold text-white leading-tight">{stat.value}</span>
              </div>
            </div>
            <div
              className={`flex items-center rounded px-2 py-1 text-xs font-bold ${
                !stat.delta ? "bg-white/5 text-muted-foreground" : stat.isPositive ? "bg-[#10b981]/15 text-[#10b981]" : "bg-[#ef4444]/15 text-[#ef4444]"
              }`}
            >
              {!!stat.delta && (stat.isPositive ? <ArrowUp className="mr-1 h-3 w-3" /> : <ArrowDown className="mr-1 h-3 w-3" />)}
              <span>{deltaText(stat.delta)}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
