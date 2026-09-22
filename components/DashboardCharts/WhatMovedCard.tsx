"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ArrowUp, ArrowDown, MoreHorizontal } from "lucide-react";
import type { WhatMovedCardData } from "@/types";

export function WhatMovedCard({ improved, regressed, period }: WhatMovedCardData) {
  return (
    <Card className="w-full flex-[2] min-w-[350px] rounded-xl border-[#2d3748] bg-[#1a202c] shadow-[0_4px_6px_rgba(0,0,0,0.3)]">
      <CardHeader className="flex flex-row items-center justify-between p-6 pb-4">
        <div>
          <CardTitle className="text-[18px] font-bold text-white tracking-tight">Page Performance Changes</CardTitle>
          <CardDescription className="text-[13px] text-gray-400 mt-1">
            Frontend performance movement &middot; {period}
          </CardDescription>
        </div>
        <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#2d3748] bg-[#0f1419] text-gray-400 hover:text-white transition-colors">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </CardHeader>
      
      <CardContent className="p-6 pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          
          {/* Gainers Column */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-2 w-2 rounded-full bg-[#10b981]" />
              <span className="text-sm font-semibold text-[#10b981]">Improved</span>
            </div>
            
            <div className="flex flex-col gap-3 max-h-[360px] overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-[#2d3748] [&::-webkit-scrollbar-thumb]:rounded-full">
              {improved.length === 0 && (
                <p className="text-xs text-gray-500">No improvements detected yet.</p>
              )}
              {improved.map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-[#2d3748] bg-[#0f1419] p-3 transition-colors hover:bg-[#2d3748]/50 cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[#2d3748] bg-[#1a202c] text-[11px] font-bold text-gray-300">
                      {item.score}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <a href="#" className="text-[13px] font-bold text-white group-hover:underline truncate">{item.page}</a>
                      <span className="text-[11px] text-gray-500 truncate">{item.metricChange}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                    <div className="flex items-center rounded bg-[#10b981]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#10b981]">
                      <ArrowUp className="mr-0.5 h-3 w-3" />
                      <span>{item.scoreDelta}</span>
                    </div>
                    <span className="text-[10px] font-medium text-gray-500">{item.monthlyTraffic}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Decliners Column */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-2 w-2 rounded-full bg-[#ef4444]" />
              <span className="text-sm font-semibold text-[#ef4444]">Regressed</span>
            </div>
            
            <div className="flex flex-col gap-3 max-h-[360px] overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-[#2d3748] [&::-webkit-scrollbar-thumb]:rounded-full">
              {regressed.length === 0 && (
                <p className="text-xs text-gray-500">No regressions detected yet.</p>
              )}
              {regressed.map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-[#2d3748] bg-[#0f1419] p-3 transition-colors hover:bg-[#2d3748]/50 cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[#2d3748] bg-[#1a202c] text-[11px] font-bold text-gray-300">
                      {item.score}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <a href="#" className="text-[13px] font-bold text-white group-hover:underline truncate">{item.page}</a>
                      <span className="text-[11px] text-gray-500 truncate">{item.metricChange}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                    <div className="flex items-center rounded bg-[#ef4444]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#ef4444]">
                      <ArrowDown className="mr-0.5 h-3 w-3" />
                      <span>{Math.abs(item.scoreDelta)}</span>
                    </div>
                    <span className="text-[10px] font-medium text-gray-500">{item.monthlyTraffic}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  );
}
