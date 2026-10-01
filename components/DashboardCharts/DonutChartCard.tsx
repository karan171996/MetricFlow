"use client";

import React from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const data = [
  { name: "best B2B CRM 2026", value: 400, fill: "#10b981" }, // green
  { name: "what is product-led growth", value: 300, fill: "#06b6d4" }, // cyan
  { name: "API rate limiting", value: 200, fill: "#3ee0a1" }, // light green
  { name: "data activation platform", value: 278, fill: "#8b5cf6" }, // purple
  { name: "modern data stack", value: 189, fill: "#f59e0b" }, // orange
];

type LegendEntry = { value?: string | number; color?: string };

const renderCustomLegend = (props: { payload?: readonly LegendEntry[] }) => {
  const { payload = [] } = props;
  return (
    <ul className="flex flex-col gap-3 pl-4">
      {payload.map((entry, index) => (
        <li key={`item-${index}`} className="flex items-center text-[13px] text-gray-300">
          <span
            className="mr-3 block h-3 w-3 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span className="truncate w-40">{entry.value}</span>
        </li>
      ))}
    </ul>
  );
};

export function DonutChartCard() {
  return (
    <Card className="w-full min-w-[350px] rounded-xl border-[#2d3748] bg-[#1a202c] shadow-[0_4px_6px_rgba(0,0,0,0.3)]">
      <CardHeader className="p-6 pb-2">
        <CardTitle className="text-[18px] font-bold text-white tracking-tight">Expense Category</CardTitle>
      </CardHeader>
      <CardContent className="p-6 pt-0">
        <div className="flex items-center h-[220px] w-full">
          <div className="relative h-full w-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} className="hover:opacity-80 cursor-pointer outline-none" />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff" }}
                  itemStyle={{ color: "#fff" }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center Text */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs text-gray-400">Citations</span>
              <span className="text-2xl font-bold text-[#10b981]">38</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                 <Legend content={renderCustomLegend} layout="vertical" verticalAlign="middle" align="right" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
