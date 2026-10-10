"use client";

import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useMetrics, hasData, provides } from "@/lib/useMetrics";
import { useThresholds } from "@/lib/useThresholds";
import type { Capability } from "@/lib/tools";
import { HubMetrics } from "./HubMetrics";
import { HubTable } from "./HubTable";

export function PerformanceHub() {
  const { state, retry } = useMetrics();
  const thresholds = useThresholds();

  if (state.status === "loading") return <Skeleton className="mt-6 h-64 w-full bg-[#2d3748]" />;
  if (state.status === "error") {
    return <EmptyState title="Could not load metrics" reason={state.message} onRetry={retry} />;
  }
  if (!state.configured) {
    return <EmptyState title="Connect your data" reason="Add your New Relic or Sentry keys to see real numbers." href="/setup" cta="Set up keys" />;
  }
  if (!state.pages.length || !state.pages.some(hasData)) {
    return <EmptyState />;
  }
  const has = (cap: Capability) => provides(state, cap);
  return (
    <>
      <HubMetrics pages={state.pages} has={has} />
      <HubTable title="All pages" pages={state.pages} has={has} thresholds={thresholds} failed={state.failed} />
    </>
  );
}
