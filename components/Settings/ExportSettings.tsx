"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DownloadCloud, FileJson } from "lucide-react";

export function ExportSettings() {
  return (
    <Card className="border-[#2d3748] bg-[#1a202c] shadow-md mt-6">
      <CardHeader>
        <CardTitle className="text-[18px] font-bold text-white tracking-tight">Export Settings</CardTitle>
        <CardDescription className="text-sm text-gray-400">
          Download your complete configuration or raw performance metrics.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4">
          <Button variant="outline" className="border-[#2d3748] bg-transparent text-gray-300 hover:bg-white/10 hover:text-white flex items-center gap-2">
            <DownloadCloud className="h-4 w-4" />
            Export as CSV
          </Button>
          <Button variant="outline" className="border-[#2d3748] bg-transparent text-gray-300 hover:bg-white/10 hover:text-white flex items-center gap-2">
            <FileJson className="h-4 w-4" />
            Export as JSON
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
