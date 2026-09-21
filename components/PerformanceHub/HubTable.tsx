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

const trackedPages = [
  { name: "Homepage", slug: "homepage", visitors: "45.2k", load: "845ms", errors: 12, status: "Healthy" },
  { name: "Pricing", slug: "pricing", visitors: "12.1k", load: "920ms", errors: 2, status: "Healthy" },
  { name: "Blog Core", slug: "blog", visitors: "84.5k", load: "1.4s", errors: 45, status: "Warning" },
  { name: "Checkout Flow", slug: "checkout", visitors: "8.4k", load: "2.1s", errors: 84, status: "Critical" },
  { name: "Documentation", slug: "docs", visitors: "24.1k", load: "780ms", errors: 5, status: "Healthy" },
];

export function HubTable() {
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
              {trackedPages.map((page) => (
                <TableRow 
                  key={page.slug} 
                  className="border-[#2d3748] hover:bg-white/5 transition-colors cursor-pointer"
                  onClick={() => router.push(`/performance/${page.slug}`)}
                >
                  <TableCell className="font-medium text-white">{page.name}</TableCell>
                  <TableCell className="text-gray-500 font-mono text-xs">/{page.slug}</TableCell>
                  <TableCell className="text-gray-400">{page.visitors}</TableCell>
                  <TableCell className="text-gray-400">{page.load}</TableCell>
                  <TableCell className="text-gray-400">{page.errors}</TableCell>
                  <TableCell className="text-right">
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
