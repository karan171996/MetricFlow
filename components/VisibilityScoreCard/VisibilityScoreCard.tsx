"use client";

import React, { useState } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { ArrowUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

const data = [
  { name: "Jan", score: 40 },
  { name: "Feb", score: 30 },
  { name: "Mar", score: 45 },
  { name: "Apr", score: 42 },
  { name: "May", score: 60 },
  { name: "Jun", score: 55 },
  { name: "Jul", score: 78.4 },
];

export function VisibilityScoreCard() {
  const [period, setPeriod] = useState("Monthly");

  return (
    <Card 
      className="group w-full min-w-[300px] max-w-[400px] rounded-xl border-[#2d3748] bg-[#1a202c] shadow-[0_4px_6px_rgba(0,0,0,0.3)] transition-all duration-300 motion-safe:hover:scale-[1.02] hover:cursor-pointer hover:shadow-lg"
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-[18px] font-bold text-white tracking-tight">Web Vitals Score</CardTitle>
          
          <div className="flex items-center rounded-full bg-[#0f1419] p-1 border border-gray-800">
            {["Daily", "Weekly", "Monthly"].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  period === p
                    ? "bg-gray-800 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <CardDescription className="text-[13px] text-gray-400 pr-20">
          Aggregate Core Web Vitals score across tracked pages
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="text-[48px] font-bold leading-none text-white tracking-tighter">
            78.4
          </span>
          <div className="flex items-center text-[14px] font-medium text-dash-success">
            <ArrowUp className="mr-1 h-4 w-4" />
            <span>2.3 vs last 30d</span>
          </div>
        </div>

        <div className="mt-4 h-[120px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorVisibility" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3ee0a1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3ee0a1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="score"
                stroke="#3ee0a1"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorVisibility)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
