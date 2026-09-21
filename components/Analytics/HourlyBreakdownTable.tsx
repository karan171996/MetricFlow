"use client";

import React from "react";
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

const hourlyData = [
  { hour: "14:00", visitors: "2.1k", errors: 3, load: "812ms", status: "Healthy" },
  { hour: "13:00", visitors: "2.4k", errors: 8, load: "845ms", status: "Warning" },
  { hour: "12:00", visitors: "3.2k", errors: 25, load: "1120ms", status: "Critical" },
  { hour: "11:00", visitors: "1.8k", errors: 2, load: "790ms", status: "Healthy" },
  { hour: "10:00", visitors: "1.5k", errors: 1, load: "780ms", status: "Healthy" },
];

export function HourlyBreakdownTable() {
  return (
    <Card className="border-[#2d3748] bg-[#1a202c] shadow-md flex-1">
      <CardHeader>
        <CardTitle className="text-[18px] font-bold text-white tracking-tight">Hourly Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-[#2d3748] overflow-hidden">
          <Table>
            <TableHeader className="bg-[#0f1419]">
              <TableRow className="border-[#2d3748] hover:bg-transparent">
                <TableHead className="text-gray-400">Hour</TableHead>
                <TableHead className="text-gray-400">Visitors</TableHead>
                <TableHead className="text-gray-400">Errors</TableHead>
                <TableHead className="text-gray-400">Avg Load</TableHead>
                <TableHead className="text-right text-gray-400">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hourlyData.map((row) => (
                <TableRow key={row.hour} className="border-[#2d3748] hover:bg-white/5 transition-colors">
                  <TableCell className="font-medium text-gray-200">{row.hour}</TableCell>
                  <TableCell className="text-gray-400">{row.visitors}</TableCell>
                  <TableCell className="text-gray-400">{row.errors}</TableCell>
                  <TableCell className="text-gray-400">{row.load}</TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="outline"
                      className={`
                        ${row.status === 'Healthy' ? 'border-[#3ee0a1] text-[#3ee0a1] bg-[#3ee0a1]/10' : ''}
                        ${row.status === 'Warning' ? 'border-[#f59e0b] text-[#f59e0b] bg-[#f59e0b]/10' : ''}
                        ${row.status === 'Critical' ? 'border-[#ef4444] text-[#ef4444] bg-[#ef4444]/10' : ''}
                      `}
                    >
                      {row.status}
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
