"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock } from "lucide-react";

const recentErrors = [
  { id: "ERR-9241", msg: "Database connection timeout", time: "12:45 PM", severity: "Critical" },
  { id: "ERR-9240", msg: "Redis cache miss spike", time: "12:30 PM", severity: "Warning" },
  { id: "ERR-9239", msg: "API Rate limit exceeded", time: "12:15 PM", severity: "Warning" },
  { id: "ERR-9238", msg: "Memory usage threshold reached", time: "11:50 AM", severity: "Critical" },
];

export function RelatedErrorsList() {
  return (
    <Card className="border-[#2d3748] bg-[#1a202c] shadow-md w-full lg:w-[400px]">
      <CardHeader>
        <CardTitle className="text-[18px] font-bold text-white tracking-tight flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-[#ef4444]" />
          Related Errors
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {recentErrors.map((err) => (
            <div key={err.id} className="flex flex-col gap-2 rounded-lg border border-[#2d3748] bg-[#0f1419] p-4 transition-colors hover:bg-white/5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-gray-500">{err.id}</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 ${err.severity === 'Critical' ? 'border-[#ef4444] text-[#ef4444] bg-[#ef4444]/10' : 'border-[#f59e0b] text-[#f59e0b] bg-[#f59e0b]/10'}`}
                >
                  {err.severity}
                </Badge>
              </div>
              <p className="text-sm font-medium text-gray-200 line-clamp-2">
                {err.msg}
              </p>
              <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                <span>{err.time}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
