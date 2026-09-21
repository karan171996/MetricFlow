"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ArrowUp, ArrowDown, MoreHorizontal } from "lucide-react";

const gainers = [
  { rank: "92", page: "/checkout", path: "LCP 1.4s → 0.9s", change: 6, vol: "8,400 views/mo" },
  { rank: "88", page: "/pricing", path: "TTFB 320ms → 190ms", change: 4, vol: "3,200 views/mo" },
  { rank: "95", page: "/product/[slug]", path: "CLS 0.18 → 0.08", change: 3, vol: "2,100 views/mo" },
  { rank: "81", page: "/blog/[slug]", path: "LCP 2.1s → 1.5s", change: 5, vol: "1,800 views/mo" },
  { rank: "90", page: "/signup", path: "TTFB 280ms → 150ms", change: 4, vol: "4,400 views/mo" },
];

const decliners = [
  { rank: "58", page: "/dashboard", path: "LCP 1.2s → 2.4s", change: -9, vol: "12,000 views/mo" },
  { rank: "64", page: "/settings", path: "CLS 0.05 → 0.15", change: -6, vol: "5,400 views/mo" },
  { rank: "49", page: "/search", path: "TTFB 200ms → 480ms", change: -11, vol: "3,200 views/mo" },
  { rank: "70", page: "/profile", path: "LCP 1.6s → 2.0s", change: -4, vol: "2,800 views/mo" },
  { rank: "55", page: "/analytics", path: "CLS 0.06 → 0.14", change: -7, vol: "1,900 views/mo" },
];

export function WhatMovedCard() {
  return (
    <Card className="w-full flex-[2] min-w-[350px] rounded-xl border-[#2d3748] bg-[#1a202c] shadow-[0_4px_6px_rgba(0,0,0,0.3)]">
      <CardHeader className="flex flex-row items-center justify-between p-6 pb-4">
        <div>
          <CardTitle className="text-[18px] font-bold text-white tracking-tight">Page Performance Changes</CardTitle>
          <CardDescription className="text-[13px] text-gray-400 mt-1">
            Frontend performance movement &middot; last 7 days
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
              {gainers.map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-[#2d3748] bg-[#0f1419] p-3 transition-colors hover:bg-[#2d3748]/50 cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[#2d3748] bg-[#1a202c] text-[11px] font-bold text-gray-300">
                      {item.rank}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <a href="#" className="text-[13px] font-bold text-white group-hover:underline truncate">{item.page}</a>
                      <span className="text-[11px] text-gray-500 truncate">{item.path}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                    <div className="flex items-center rounded bg-[#10b981]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#10b981]">
                      <ArrowUp className="mr-0.5 h-3 w-3" />
                      <span>{item.change}</span>
                    </div>
                    <span className="text-[10px] font-medium text-gray-500">{item.vol}</span>
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
              {decliners.map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-[#2d3748] bg-[#0f1419] p-3 transition-colors hover:bg-[#2d3748]/50 cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[#2d3748] bg-[#1a202c] text-[11px] font-bold text-gray-300">
                      {item.rank}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <a href="#" className="text-[13px] font-bold text-white group-hover:underline truncate">{item.page}</a>
                      <span className="text-[11px] text-gray-500 truncate">{item.path}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                    <div className="flex items-center rounded bg-[#ef4444]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#ef4444]">
                      <ArrowDown className="mr-0.5 h-3 w-3" />
                      <span>{Math.abs(item.change)}</span>
                    </div>
                    <span className="text-[10px] font-medium text-gray-500">{item.vol}</span>
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
