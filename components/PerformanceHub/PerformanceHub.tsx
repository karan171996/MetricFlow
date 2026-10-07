"use client";

import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useMetrics, hasData, showsSentry, NEEDS_NEW_RELIC } from "@/lib/useMetrics";
import { HubMetrics } from "./HubMetrics";
import { HubTable } from "./HubTable";

export function PerformanceHub() {
  const { state, retry } = useMetrics();

  if (state.status === "loading") return <Skeleton className="mt-6 h-64 w-full bg-[#2d3748]" />;
  if (state.status === "error") {
    return <EmptyState title="Could not load metrics" reason={state.message} onRetry={retry} />;
  }
  if (!state.configured) {
    return <EmptyState title="Connect your data" reason="Add your New Relic or Sentry keys to see real numbers." href="/setup" cta="Set up keys" />;
  }
  if (!state.tools.includes("new-relic")) return <EmptyState {...NEEDS_NEW_RELIC} />;
  if (!state.pages.length || !state.pages.some(hasData)) {
    return <EmptyState />;
  }
  return (
    <>
      <HubMetrics pages={state.pages} showSentry={showsSentry(state)} />
      <HubTable pages={state.pages} showSentry={showsSentry(state)} />
    </>
  );
}
