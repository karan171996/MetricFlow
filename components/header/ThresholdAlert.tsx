"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OctagonAlert, TriangleAlert } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { HUB_TABLE_TITLE_ID } from "@/components/PerformanceHub/HubTable";
import type { MetricsPage } from "@/lib/metricsHistory";
import { breachReasons, rankPages, type Thresholds } from "@/lib/thresholds";
import { useNotificationPrefs } from "@/lib/useNotificationPrefs";

/** Dismissing in one tab dismisses the same breach in every open tab. Also the sessionStorage key, so a reload does not bring it back. */
const CHANNEL = "perf-threshold-alert";
const MAX_LINES = 3;
const LINK = "inline-flex min-h-11 items-center rounded-sm font-medium text-dash-foreground underline underline-offset-4 outline-none hover:text-dash-muted-light focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-8";

function stored(): string {
  try {
    return sessionStorage.getItem(CHANNEL) ?? "";
  } catch {
    return ""; // no sessionStorage (private mode, server render): the banner simply is not remembered
  }
}

function remember(signature: string) {
  try {
    sessionStorage.setItem(CHANNEL, signature);
  } catch {}
}

/**
 * Inline banner on the home screen: the pages over a limit, worst first, and by how much. It reads the pages it is given
 * (no polling of its own) and is a labelled region, not an alert, so the 30s refresh does not re-announce it.
 * A dismissed banner stays away for the browser session until the set of breaching pages or a severity changes.
 */
export function ThresholdAlert({ pages, thresholds }: { pages: MetricsPage[]; thresholds: Thresholds }) {
  const { alert } = useNotificationPrefs();
  const [dismissed, setDismissed] = useState(stored);

  useEffect(() => {
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (e) => {
      remember(String(e.data));
      setDismissed(String(e.data));
    };
    return () => ch.close();
  }, []);

  // Same order and statuses as the table below. A page has a status only when every threshold input is provided.
  const breached = rankPages(pages, thresholds).filter((p) => p.status === "Warning" || p.status === "Critical");
  // Sorted, so a change of rank alone (same pages, same severities) does not bring a dismissed banner back.
  const signature = breached.map((p) => `${p.slug}:${p.status}`).sort().join(",");
  if (!alert || !breached.length || signature === dismissed) return null;

  const critical = breached.some((p) => p.status === "Critical");
  const Icon = critical ? OctagonAlert : TriangleAlert;
  const more = breached.length - MAX_LINES;
  const dismiss = () => {
    remember(signature);
    setDismissed(signature);
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage(signature);
    ch.close();
    document.getElementById(HUB_TABLE_TITLE_ID)?.focus();
  };

  return (
    <Alert
      role="region"
      aria-label="Pages over a limit"
      data-severity={critical ? "critical" : "warning"}
      className={`mb-4 block px-4 py-3 text-dash-foreground ${critical ? "border-dash-danger/40 bg-dash-danger/10" : "border-dash-warning/40 bg-dash-warning/10"}`}
    >
      <div className="flex gap-3">
        <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${critical ? "text-dash-danger" : "text-dash-warning"}`} />
        {/* In the DOM the actions come after the lines (keyboard order); from md they sit to the right of the title. */}
        <div className="min-w-0 flex-1 md:grid md:grid-cols-[1fr_auto] md:gap-x-6">
          <p data-slot="banner-title" className="text-body font-semibold md:col-start-1 md:row-start-1">
            {breached.length === 1 ? "1 page is over a limit" : `${breached.length} pages are over a limit`}
          </p>
          <div data-slot="banner-lines" className="text-body text-dash-muted-light md:col-start-1 md:row-start-2">
            <ul>
              {breached.slice(0, MAX_LINES).map((p) => (
                <li key={p.slug} data-slug={p.slug} className="flex flex-wrap items-center gap-x-3">
                  <span className="min-w-0 break-words">{p.status} · {p.name}: {breachReasons(p, thresholds).join(", ")}</span>
                  <Link href={`/performance/${p.slug}`} aria-label={`View page: ${p.name}`} className={LINK}>View page</Link>
                </li>
              ))}
            </ul>
            {more > 0 && <p>and {more} more in the table below</p>}
          </div>
          <div data-slot="banner-actions" className="flex items-center gap-4 md:col-start-2 md:row-span-2 md:row-start-1 md:self-start">
            <Link href="/settings?tab=thresholds" className={LINK}>Edit limits</Link>
            <Button variant="ghost" className="min-h-11 md:min-h-8" onClick={dismiss}>Dismiss</Button>
          </div>
        </div>
      </div>
    </Alert>
  );
}
