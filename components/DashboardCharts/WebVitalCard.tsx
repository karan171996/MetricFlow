"use client";

import React, { useState } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { WebVitalCardData } from "@/types";

type WebVitalCardProps = WebVitalCardData;

export function WebVitalCard({ title, description, value, change, direction, isPositive, color, data }: WebVitalCardProps) {
  const [period, setPeriod] = useState("Monthly");

  return (
    <Card 
      className="group w-full min-w-[250px] rounded-xl border-[#2d3748] bg-[#1a202c] shadow-[0_4px_6px_rgba(0,0,0,0.3)] transition-all duration-300 hover:scale-[1.02] hover:cursor-pointer hover:shadow-lg flex flex-col"
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-[16px] font-bold text-white tracking-tight">{title}</CardTitle>
          
          <div className="flex items-center rounded-full bg-[#0f1419] p-0.5 border border-gray-800">
            {["1D", "7D", "30D"].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
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
        <CardDescription className="text-[12px] text-gray-400">
          {description}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col flex-1 justify-end">
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-[32px] font-bold leading-none text-white tracking-tighter">
            {value}
          </span>
          <div className={`flex items-center text-[12px] font-medium ${isPositive === null ? 'text-muted-foreground' : isPositive ? 'text-[#3ee0a1]' : 'text-[#ef4444]'}`}>
            {direction === 'up' && <ArrowUp className="mr-0.5 h-3 w-3" />}
            {direction === 'down' && <ArrowDown className="mr-0.5 h-3 w-3" />}
            <span>{change}</span>
          </div>
        </div>

        <div className="mt-4 h-[80px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={`color-${title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#color-${title})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
