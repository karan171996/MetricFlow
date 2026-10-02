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
import type { MetricsPage } from "@/lib/metricsHistory";
import { formatDuration } from "@/lib/formatDuration";

export function HubTable({ pages }: { pages: MetricsPage[] }) {
  const router = useRouter();

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
                <TableHead className="text-gray-400">Visitors (24h)</TableHead>
                <TableHead className="text-gray-400">Avg Load</TableHead>
                <TableHead className="text-gray-400">Errors</TableHead>
                <TableHead className="text-right text-gray-400">Status</TableHead>
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
                  <TableCell className="text-gray-400">{live ? page.visitors : "—"}</TableCell>
                  <TableCell className="text-gray-400">{live ? formatDuration(page.newRelic.loadTime) : "—"}</TableCell>
                  <TableCell className="text-gray-400">{live ? page.sentry.errorCount : "—"}</TableCell>
                  <TableCell className="text-right">
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
                  </TableCell>
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
