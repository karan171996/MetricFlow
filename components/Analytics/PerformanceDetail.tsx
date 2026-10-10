"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/PerformanceHub/HubTable";
import { Skeleton } from "@/components/ui/skeleton";
import { useMetrics, hasData, provides } from "@/lib/useMetrics";
import { useThresholds } from "@/lib/useThresholds";
import { breachReasons, deriveStatus, hasPerformance } from "@/lib/thresholds";
import { PerformanceBreadcrumb } from "./PerformanceBreadcrumb";
import { PerformanceKPIs } from "./PerformanceKPIs";
import { RelatedErrorsList } from "./RelatedErrorsList";

const NO_DATA_REASON = "Keys work, but no page events have arrived.";

export function PerformanceDetail({ slug }: { slug: string }) {
  const { state, retry } = useMetrics();
  const thresholds = useThresholds();

  if (state.status === "loading") return <Skeleton className="h-64 w-full bg-[#2d3748]" />;
  if (state.status === "error") {
    return <EmptyState title="Could not load metrics" reason={state.message} onRetry={retry} />;
  }
  if (!state.configured) {
    return <EmptyState title="Connect your data" reason="Add your New Relic or Sentry keys to see real numbers." href="/setup" cta="Set up keys" />;
  }
  if (state.pages.length === 0) return <EmptyState />;
  const found = state.pages.find((p) => p.slug === slug);
  if (!found) notFound();
  const has = (cap: Parameters<typeof provides>[1]) => provides(state, cap);

  // Judged here, as rankPages does: never the status the server sent. A metric the tool set does not provide is not judged.
  const judgeable = has("loadTime") && has("errorRate") && has("apdex") && hasPerformance(found);
  const page = { ...found, status: judgeable ? deriveStatus(found.metrics, thresholds) : undefined };
  const live = hasData(page);
  const reasons = page.status ? breachReasons(page, thresholds) : [];
  const sentence = !live ? NO_DATA_REASON
    : !page.status ? "No performance data from New Relic for this page yet."
    : reasons.length ? `Over a limit: ${reasons.join(", ")}.`
    : "Within your limits.";

  return (
    <>
      <PerformanceBreadcrumb pageName={page.name} />
      <section aria-labelledby="page-status-title" className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="page-status-title" className="sr-only">Status</h2>
        <StatusBadge page={page} />
        <p data-slot="status-sentence" className="text-body text-dash-foreground">{sentence}</p>
        <Link href="/settings?tab=thresholds" className="inline-flex min-h-11 items-center rounded-sm font-medium text-dash-foreground underline underline-offset-4 outline-none hover:text-dash-muted-light focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-8">
          Edit limits
        </Link>
      </section>
      {live ? (
        <>
          <PerformanceKPIs page={page} has={has} thresholds={thresholds} />
          {/* ponytail: trend charts + hourly table return with persisted history (Phase 3). */}
          {page.metrics.errors && <RelatedErrorsList errors={page.metrics.errors.latest} />}
        </>
      ) : (
        <EmptyState reason={`${page.name} (${page.url}): ${NO_DATA_REASON}`} />
      )}
    </>
  );
}
