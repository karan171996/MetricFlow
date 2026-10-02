"use client";

import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BarChartCardData } from "@/types";
import { formatDuration } from "@/lib/formatDuration";

interface CustomTooltipProps {
  active?: boolean;
  payload?: { payload: { name: string }; value: number }[];
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1f2937] p-2 rounded-lg shadow-xl text-white text-xs">
        <p className="font-semibold">{payload[0].payload.name}</p>
        <p className="text-[#10b981]">{formatDuration(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

export function BarChartCard({ title, items }: BarChartCardData) {
  if (items.length === 0) {
    return (
      <Card className="w-full min-w-[350px] rounded-xl border-[#2d3748] bg-[#1a202c] shadow-[0_4px_6px_rgba(0,0,0,0.3)]">
        <CardHeader className="p-6 pb-2">
          <CardTitle className="text-[18px] font-bold text-white tracking-tight">{title}</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-2">
          <p className="text-xs text-gray-500">
            No API calls measured yet — refresh once /api/metrics has run.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full min-w-[350px] rounded-xl border-[#2d3748] bg-[#1a202c] shadow-[0_4px_6px_rgba(0,0,0,0.3)]">
      <CardHeader className="p-6 pb-2">
        <CardTitle className="text-[18px] font-bold text-white tracking-tight">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-6 pt-2">
        <div className="h-[250px] w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={items}
              layout="vertical"
              margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
              barSize={12}
            >
              <XAxis type="number" hide />
              <YAxis 
                dataKey="name" 
                type="category" 
                axisLine={false} 
                tickLine={false}
                tick={{ fill: "#9ca3af", fontSize: 12 }}
                width={120}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar 
                dataKey="value" 
                fill="#10b981" 
                radius={4}
                background={{ fill: '#2d3748', radius: 4 }}
              >
                <LabelList 
                  dataKey="value" 
                  position="right" 
                  fill="#9ca3af" 
                  fontSize={12}
                  formatter={(value) => formatDuration(Number(value))}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
