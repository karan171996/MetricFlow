"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell } from "lucide-react";

export function NotificationPrefs() {
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [slackAlerts, setSlackAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);

  return (
    <Card className="border-[#2d3748] bg-[#1a202c] shadow-md mb-6">
      <CardHeader>
        <CardTitle className="text-[18px] font-bold text-white tracking-tight flex items-center gap-2">
          <Bell className="h-5 w-5 text-gray-400" />
          Notification Preferences
        </CardTitle>
        <CardDescription className="text-sm text-gray-400">
          Choose where and how you want to be alerted when thresholds are breached.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 max-w-lg">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-gray-300 text-sm">Email Alerts</Label>
            <p className="text-xs text-gray-500">Receive reports and alerts to your primary email.</p>
          </div>
          <Switch checked={emailAlerts} onCheckedChange={setEmailAlerts} />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-gray-300 text-sm">Slack Integration</Label>
            <p className="text-xs text-gray-500">Push critical alerts directly to a configured Slack channel.</p>
          </div>
          <Switch checked={slackAlerts} onCheckedChange={setSlackAlerts} />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-gray-300 text-sm">SMS Alerts</Label>
            <p className="text-xs text-gray-500">Get text messages for immediate downtime incidents.</p>
          </div>
          <Switch checked={smsAlerts} onCheckedChange={setSmsAlerts} />
        </div>
      </CardContent>
    </Card>
  );
}
