"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { hasData } from "@/lib/useMetrics";
import { isSampled } from "@/lib/dashboardTransforms";
import type { MetricsPage } from "@/lib/metricsHistory";
import type { Capability } from "@/lib/tools";
import { formatDuration } from "@/lib/formatDuration";

export function HubTable({ pages, has }: { pages: MetricsPage[]; has: (cap: Capability) => boolean }) {
  const router = useRouter();
  // No page has a status unless every input of deriveStatus is provided; then there is no column either.
  const hasStatus = pages.some((p) => p.status);

  return (
    <Card className="border-[#2d3748] bg-[#1a202c] shadow-md flex-1">
      <CardHeader>
        <CardTitle className="text-[18px] font-bold text-white tracking-tight">Tracked Pages Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-[#2d3748] overflow-hidden">
          <Table>
            <TableHeader className="bg-[#0f1419]">
              <TableRow className="border-[#2d3748] hover:bg-transparent">
                <TableHead className="text-gray-400">Page Name</TableHead>
                <TableHead className="text-gray-400">Path</TableHead>
                {has("traffic") && <TableHead className="text-gray-400">{isSampled(pages) ? "Page loads (sampled)" : "Visitors (24h)"}</TableHead>}
                {has("loadTime") && <TableHead className="text-gray-400">Avg Load</TableHead>}
                {has("errors") && <TableHead className="text-gray-400">Errors</TableHead>}
                {hasStatus && <TableHead className="text-right text-gray-400">Status</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.map((page) => {
                const live = hasData(page);
                return (
                <TableRow 
                  key={page.slug} 
                  className="border-[#2d3748] hover:bg-white/5 transition-colors cursor-pointer"
                  onClick={() => router.push(`/performance/${page.slug}`)}
                >
                  <TableCell className="font-medium text-white">{page.name}</TableCell>
                  <TableCell className="text-gray-500 font-mono text-xs">{page.url}</TableCell>
                  {/* A page listed only for its errors has no traffic number: that is "—", not 0. */}
                  {has("traffic") && <TableCell className="text-gray-400">{live && page.metrics.traffic ? page.visitors : "—"}</TableCell>}
                  {has("loadTime") && <TableCell className="text-gray-400">{live && page.metrics.loadTime !== undefined ? formatDuration(page.metrics.loadTime) : "—"}</TableCell>}
                  {has("errors") && <TableCell className="text-gray-400">{live ? page.metrics.errors?.count : "—"}</TableCell>}
                  {hasStatus && <TableCell className="text-right">
                    {!live ? (
                      <Badge variant="outline" className="border-[#4a5568] text-gray-400">No data yet</Badge>
                    ) : (
                    <Badge
                      variant="outline"
                      className={`
                        ${page.status === 'Healthy' ? 'border-[#3ee0a1] text-[#3ee0a1] bg-[#3ee0a1]/10' : ''}
                        ${page.status === 'Warning' ? 'border-[#f59e0b] text-[#f59e0b] bg-[#f59e0b]/10' : ''}
                        ${page.status === 'Critical' ? 'border-[#ef4444] text-[#ef4444] bg-[#ef4444]/10' : ''}
                      `}
                    >
                      {page.status}
                    </Badge>
                    )}
                  </TableCell>}
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
