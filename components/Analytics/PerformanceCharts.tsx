"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const data = [
  { time: "00:00", load: 820, errors: 12, traffic: 3200 },
  { time: "04:00", load: 780, errors: 8, traffic: 1800 },
  { time: "08:00", load: 950, errors: 25, traffic: 8900 },
  { time: "12:00", load: 1100, errors: 45, traffic: 14500 },
  { time: "16:00", load: 920, errors: 30, traffic: 11200 },
  { time: "20:00", load: 850, errors: 15, traffic: 7600 },
  { time: "24:00", load: 810, errors: 10, traffic: 4100 },
];

export function PerformanceCharts() {
  return (
    <div className="grid gap-6 lg:grid-cols-3 mb-8">
      {/* Load Time History (Line) */}
      <Card className="border-[#2d3748] bg-[#1a202c] shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-[16px] font-bold text-white">Load Time History</CardTitle>
        </CardHeader>
        <CardContent className="h-[200px] w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" />
              <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff" }} />
              <Line type="monotone" dataKey="load" stroke="#3ee0a1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Error Rate History (Area) */}
      <Card className="border-[#2d3748] bg-[#1a202c] shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-[16px] font-bold text-white">Error Rate (5xx)</CardTitle>
        </CardHeader>
        <CardContent className="h-[200px] w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorErrors" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" />
              <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff" }} />
              <Area type="monotone" dataKey="errors" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorErrors)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Traffic Volume (Bar) */}
      <Card className="border-[#2d3748] bg-[#1a202c] shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-[16px] font-bold text-white">Traffic Volume</CardTitle>
        </CardHeader>
        <CardContent className="h-[200px] w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" />
              <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 11 }} tickFormatter={(val) => `${val/1000}k`} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff" }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="traffic" fill="#06b6d4" radius={[4, 4, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
