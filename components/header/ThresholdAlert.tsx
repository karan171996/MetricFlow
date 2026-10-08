"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { hasData, useMetrics } from "@/lib/useMetrics";
import { useNotificationPrefs } from "@/lib/useNotificationPrefs";

/** Dismissing in one tab dismisses the same breach in every open tab. */
const CHANNEL = "perf-threshold-alert";

/** Alert shown when a page with data crosses a threshold (Warning/Critical); reappears if the set of breaches changes. */
export function ThresholdAlert() {
  const { state } = useMetrics();
  const { alert } = useNotificationPrefs();
  const [dismissed, setDismissed] = useState("");

  useEffect(() => {
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (e) => setDismissed(String(e.data));
    return () => ch.close();
  }, []);

  // A page has a status only when every threshold input is provided; without one there is nothing to alert on.
  if (!alert || state.status !== "ready") return null;
  const breached = state.pages.filter((p) => hasData(p) && p.status && p.status !== "Healthy");
  const signature = breached.map((p) => `${p.slug}:${p.status}`).join(",");
  if (!breached.length || signature === dismissed) return null;

  const critical = breached.some((p) => p.status === "Critical");
  const dismiss = () => {
    setDismissed(signature);
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage(signature);
    ch.close();
  };

  return (
    <Alert variant={critical ? "destructive" : "default"} className={`fixed! top-0 right-0 z-50 m-4 max-w-md py-4 shadow-lg ${critical ? "" : "bg-amber-950 text-amber-200"}`}>
      <AlertTriangle />
      <AlertTitle>{critical ? "Critical: threshold exceeded" : "Warning: approaching threshold"}</AlertTitle>
      <AlertDescription>
        {breached.map((p) => `${p.name} (${p.status})`).join(", ")} — adjust limits in Settings → Performance Thresholds.
      </AlertDescription>
      <AlertAction>
        <Button variant="outline" size="sm" onClick={dismiss}>
          Dismiss
        </Button>
      </AlertAction>
    </Alert>
  );
}
