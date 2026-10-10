"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, ReferenceLine } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BarChartCardData } from "@/types";
import { formatDuration } from "@/lib/formatDuration";
import { easeOut, interpolateItems } from "@/lib/interpolateItems";

const GROW_MS = 800;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const mql = window.matchMedia(REDUCED_MOTION);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { payload: { name: string; value: number } }[];
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1f2937] p-2 rounded-lg shadow-xl text-white text-xs">
        <p className="font-semibold">{payload[0].payload.name}</p>
        <p className="text-[#10b981]">{formatDuration(payload[0].payload.value)}</p>
      </div>
    );
  }
  return null;
};

/** `failed`: the last load of the items failed. Bars already on screen stay; with none, the card says so. */
export function BarChartCard({ title, items, failed }: BarChartCardData & { failed?: boolean }) {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false
  );
  // Values on screen right now, by item name. Bar and label both read this one
  // number, so they cannot get out of step. The ref mirrors the state so the
  // effect can start from what is shown without re-running on every frame.
  const [shown, setShown] = useState<Record<string, number>>({});
  const shownRef = useRef(shown);

  useEffect(() => {
    if (reducedMotion) return;
    const from = shownRef.current;
    // Unchanged data (the usual 30s refresh): nothing to animate, no re-render.
    if (items.every((item) => from[item.name] === item.value)) return;
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, Math.max(0, (now - start) / GROW_MS));
      const next = interpolateItems(items, from, easeOut(t));
      shownRef.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [items, reducedMotion]);

  if (items.length === 0) {
    return (
      <Card className="w-full rounded-xl border-[#2d3748] bg-[#1a202c] shadow-[0_4px_6px_rgba(0,0,0,0.3)]">
        <CardHeader className="p-6 pb-2">
          <CardTitle className="text-[18px] font-bold text-white tracking-tight">{title}</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-2">
          <p className="text-xs text-dash-muted">
            {failed ? "Could not load API response times." : "No API calls measured yet — refresh once /api/metrics has run."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const rows = items.map((item) => {
    const current = reducedMotion ? item.value : (shown[item.name] ?? 0);
    return {
      ...item,
      shown: current,
      // No label while a count-up still rounds to zero: a passing "0ms" would read
      // as an invented zero. A real, settled zero is still labelled as before.
      label: current === item.value || Math.round(current) !== 0 ? formatDuration(current) : "",
    };
  });
  const finalMax = Math.max(...items.map((item) => item.value));

  return (
    <Card className="w-full rounded-xl border-[#2d3748] bg-[#1a202c] shadow-[0_4px_6px_rgba(0,0,0,0.3)]">
      <CardHeader className="p-6 pb-2">
        <CardTitle className="text-[18px] font-bold text-white tracking-tight">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-6 pt-2">
        <div className="h-[250px] w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
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
              {/* Invisible: keeps the x scale sized for the final values (same auto
                  domain as before), so bars grow instead of the scale moving. */}
              <ReferenceLine x={finalMax} ifOverflow="extendDomain" stroke="none" />
              {/* recharts' own animation hides labels until it ends; we drive the values instead. */}
              <Bar 
                dataKey="shown" 
                isAnimationActive={false}
                fill="#10b981" 
                radius={4}
                background={{ fill: '#2d3748', radius: 4 }}
              >
                <LabelList 
                  dataKey="label" 
                  position="right" 
                  fill="#9ca3af" 
                  fontSize={12}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
