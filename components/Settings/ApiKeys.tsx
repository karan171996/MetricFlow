"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Key, Copy, Check } from "lucide-react";

export function ApiKeys() {
  const [copied, setCopied] = useState(false);
  const apiKey = "pk_live_51Mxxxxxxxxxxxxxxxxxxx";

  const handleCopy = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="border-[#2d3748] bg-[#1a202c] shadow-md">
      <CardHeader>
        <CardTitle className="text-[18px] font-bold text-white tracking-tight flex items-center gap-2">
          <Key className="h-5 w-5 text-gray-400" />
          API Keys
        </CardTitle>
        <CardDescription className="text-sm text-gray-400">
          Manage your API keys for programmatic access to the dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 max-w-md">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-300">Live Secret Key</label>
            <div className="flex items-center gap-2">
              <Input 
                value={apiKey} 
                readOnly 
                className="bg-[#0f1419] border-[#2d3748] text-gray-300 font-mono text-xs focus-visible:ring-0" 
              />
              <Button 
                variant="outline" 
                size="icon" 
                onClick={handleCopy}
                className="border-[#2d3748] bg-transparent hover:bg-white/10 hover:text-white"
              >
                {copied ? <Check className="h-4 w-4 text-[#3ee0a1]" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="pt-2">
            <Button className="bg-[#3ee0a1] text-black hover:bg-[#3ee0a1]/80">Generate New Key</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
