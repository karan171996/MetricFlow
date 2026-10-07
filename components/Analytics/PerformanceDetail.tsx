"use client";

import { notFound } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useMetrics, hasData, NEEDS_NEW_RELIC } from "@/lib/useMetrics";
import { PerformanceBreadcrumb } from "./PerformanceBreadcrumb";
import { PerformanceKPIs } from "./PerformanceKPIs";
import { RelatedErrorsList } from "./RelatedErrorsList";

export function PerformanceDetail({ slug }: { slug: string }) {
  const { state, retry } = useMetrics();

  if (state.status === "loading") return <Skeleton className="h-64 w-full bg-[#2d3748]" />;
  if (state.status === "error") {
    return <EmptyState title="Could not load metrics" reason={state.message} onRetry={retry} />;
  }
  if (!state.configured) {
    return <EmptyState title="Connect your data" reason="Add your New Relic or Sentry keys to see real numbers." href="/setup" cta="Set up keys" />;
  }
  if (!state.tools.includes("new-relic")) return <EmptyState {...NEEDS_NEW_RELIC} />;
  if (state.pages.length === 0) return <EmptyState />;
  const page = state.pages.find((p) => p.slug === slug);
  if (!page) notFound();

  return (
    <>
      <PerformanceBreadcrumb pageName={page.name} />
      {hasData(page) ? (
        <>
          <PerformanceKPIs page={page} />
          {/* ponytail: trend charts + hourly table return with persisted history (Phase 3). */}
          {page.sentry && <RelatedErrorsList errors={page.sentry.latestErrors} />}
        </>
      ) : (
        <EmptyState reason={`${page.name} (${page.url}): keys work, but no page events have arrived.`} />
      )}
    </>
  );
}
