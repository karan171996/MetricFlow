"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ArrowUp, ArrowDown, MoreHorizontal } from "lucide-react";

const gainers = [
  { rank: "#3", keyword: "best B2B CRM 2026", path: "/blog/best-crm-2026", change: 6, vol: "8,400/mo" },
  { rank: "#5", keyword: "API integration testing", path: "/guides/api-testing", change: 4, vol: "3,200/mo" },
  { rank: "#2", keyword: "switching from Salesforce", path: "/compare/salesforce-alternatives", change: 3, vol: "2,100/mo" },
  { rank: "#8", keyword: "lead scoring model", path: "/blog/lead-scoring", change: 5, vol: "1,800/mo" },
  { rank: "#4", keyword: "data warehouse vs data lake", path: "/blog/warehouse-vs-lake", change: 4, vol: "4,400/mo" },
];

const decliners = [
  { rank: "#18", keyword: "marketing automation", path: "/blog/marketing-automation", change: -9, vol: "12,000/mo" },
  { rank: "#14", keyword: "what is RevOps", path: "/guides/revops-101", change: -6, vol: "5,400/mo" },
  { rank: "#22", keyword: "B2B email subject lines", path: "/blog/email-subject-lines", change: -11, vol: "3,200/mo" },
  { rank: "#16", keyword: "sales pipeline template", path: "/resources/pipeline-template", change: -4, vol: "2,800/mo" },
  { rank: "#19", keyword: "outbound vs inbound", path: "/blog/outbound-inbound", change: -7, vol: "1,900/mo" },
];

export function WhatMovedCard() {
  return (
    <Card className="w-full flex-[2] min-w-[350px] rounded-xl border-[#2d3748] bg-[#1a202c] shadow-[0_4px_6px_rgba(0,0,0,0.3)]">
      <CardHeader className="flex flex-row items-center justify-between p-6 pb-4">
        <div>
          <CardTitle className="text-[18px] font-bold text-white tracking-tight">What moved this week</CardTitle>
          <CardDescription className="text-[13px] text-gray-400 mt-1">
            Keyword rankings movement &middot; last 7 days
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
              <span className="text-sm font-semibold text-[#10b981]">Gainers</span>
            </div>
            
            <div className="flex flex-col gap-3 max-h-[360px] overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-[#2d3748] [&::-webkit-scrollbar-thumb]:rounded-full">
              {gainers.map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-[#2d3748] bg-[#0f1419] p-3 transition-colors hover:bg-[#2d3748]/50 cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[#2d3748] bg-[#1a202c] text-[11px] font-bold text-gray-300">
                      {item.rank}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <a href="#" className="text-[13px] font-bold text-white group-hover:underline truncate">{item.keyword}</a>
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
              <span className="text-sm font-semibold text-[#ef4444]">Decliners</span>
            </div>
            
            <div className="flex flex-col gap-3 max-h-[360px] overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-[#2d3748] [&::-webkit-scrollbar-thumb]:rounded-full">
              {decliners.map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-[#2d3748] bg-[#0f1419] p-3 transition-colors hover:bg-[#2d3748]/50 cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[#2d3748] bg-[#1a202c] text-[11px] font-bold text-gray-300">
                      {item.rank}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <a href="#" className="text-[13px] font-bold text-white group-hover:underline truncate">{item.keyword}</a>
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
