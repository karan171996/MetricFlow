import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/* ────────────────────────────────────────────────
   Reusable building blocks
──────────────────────────────────────────────── */

/** A dark card shell that matches the dashboard card style */
function SkeletonCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <Card className={`w-full rounded-xl border-[#2d3748] bg-[#1a202c] shadow-[0_4px_6px_rgba(0,0,0,0.3)] ${className}`}>
      {children}
    </Card>
  );
}

/** Glowing line — replaces Skeleton bg-muted with a dark-mode aware shimmer */
function Shimmer({ className = "" }: { className?: string }) {
  return (
    <Skeleton className={`bg-[#2d3748] ${className}`} />
  );
}

/* ────────────────────────────────────────────────
   KPI stat card skeleton  (top row: 4 cards)
──────────────────────────────────────────────── */
export function StatCardSkeleton() {
  return (
    <SkeletonCard>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <Shimmer className="h-3 w-28 rounded-full" />
          <Shimmer className="h-8 w-8 rounded-lg" />
        </div>
        <Shimmer className="h-8 w-20 rounded-md mb-2" />
        <Shimmer className="h-3 w-36 rounded-full" />
      </CardContent>
    </SkeletonCard>
  );
}

/* ────────────────────────────────────────────────
   Web Vital card skeleton  (TTFB / LCP / CLS)
──────────────────────────────────────────────── */
export function WebVitalCardSkeleton() {
  return (
    <SkeletonCard>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <Shimmer className="h-4 w-16 rounded-md" />
          <Shimmer className="h-6 w-24 rounded-full" />
        </div>
        <Shimmer className="h-3 w-32 rounded-full mt-2" />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2 mt-2">
          <Shimmer className="h-8 w-20 rounded-md" />
          <Shimmer className="h-4 w-14 rounded-full" />
        </div>
        {/* Simulated sparkline */}
        <div className="mt-4 h-[80px] w-full rounded-lg overflow-hidden">
          <Shimmer className="h-full w-full rounded-lg" />
        </div>
      </CardContent>
    </SkeletonCard>
  );
}

/* ────────────────────────────────────────────────
   Line / Area chart card skeleton
──────────────────────────────────────────────── */
export function LineChartCardSkeleton() {
  return (
    <SkeletonCard>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Shimmer className="h-5 w-36 rounded-md" />
          <Shimmer className="h-7 w-28 rounded-full" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full rounded-lg overflow-hidden">
          <Shimmer className="h-full w-full rounded-lg" />
        </div>
        {/* X-axis labels */}
        <div className="flex justify-between mt-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Shimmer key={i} className="h-3 w-8 rounded-full" />
          ))}
        </div>
      </CardContent>
    </SkeletonCard>
  );
}

/* ────────────────────────────────────────────────
   Bar chart card skeleton
──────────────────────────────────────────────── */
export function BarChartCardSkeleton() {
  return (
    <SkeletonCard>
      <CardHeader className="pb-2">
        <Shimmer className="h-5 w-40 rounded-md" />
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Shimmer className="h-3 w-16 rounded-full flex-shrink-0" />
              <Skeleton className={`h-5 rounded-md bg-[#2d3748]`} style={{ width: `${60 + i * 8}%` }} />
            </div>
          ))}
        </div>
      </CardContent>
    </SkeletonCard>
  );
}

/* ────────────────────────────────────────────────
   AI Suggestions list card skeleton
──────────────────────────────────────────────── */
export function AISuggestionsCardSkeleton() {
  return (
    <SkeletonCard>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Shimmer className="h-5 w-5 rounded-full" />
          <Shimmer className="h-5 w-32 rounded-md" />
        </div>
        <Shimmer className="h-3 w-44 rounded-full mt-2" />
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg border border-[#2d3748] bg-[#0f1419] p-3"
            >
              <Shimmer className="h-4 w-4 rounded-full flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Shimmer className="h-3 w-20 rounded-full" />
                  <Shimmer className="h-4 w-12 rounded-full" />
                </div>
                <Shimmer className="h-3 w-full rounded-full" />
                <Shimmer className="h-3 w-4/5 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </SkeletonCard>
  );
}

/* ────────────────────────────────────────────────
   Visibility Breakdown card skeleton
──────────────────────────────────────────────── */
export function VisibilityBreakdownCardSkeleton() {
  return (
    <SkeletonCard>
      <CardHeader>
        <Shimmer className="h-5 w-48 rounded-md" />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-3 mb-4">
          <Shimmer className="h-12 w-20 rounded-md" />
          <Shimmer className="h-5 w-16 rounded-full" />
        </div>
        <div className="h-[80px] w-full rounded-lg overflow-hidden mb-4">
          <Shimmer className="h-full w-full rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1">
              <Shimmer className="h-3 w-24 rounded-full" />
              <Shimmer className="h-6 w-16 rounded-md" />
            </div>
          ))}
        </div>
      </CardContent>
    </SkeletonCard>
  );
}

/* ────────────────────────────────────────────────
   What Moved card skeleton (Gainers / Decliners)
──────────────────────────────────────────────── */
export function WhatMovedCardSkeleton() {
  return (
    <SkeletonCard>
      <CardHeader>
        <Shimmer className="h-5 w-40 rounded-md" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, col) => (
            <div key={col} className="flex flex-col gap-3">
              <Shimmer className="h-4 w-20 rounded-full" />
              {Array.from({ length: 4 }).map((_, row) => (
                <div key={row} className="flex items-center gap-2">
                  <Shimmer className="h-4 w-8 rounded-md" />
                  <Shimmer className="h-3 flex-1 rounded-full" />
                  <Shimmer className="h-3 w-8 rounded-full" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </SkeletonCard>
  );
}

/* ────────────────────────────────────────────────
   Full dashboard body skeleton (KPI row + charts grid)
   Shared by app/loading.tsx (route-level Suspense) and
   app/page.tsx (client-side first-fetch state).
──────────────────────────────────────────────── */
export function DashboardBodySkeleton() {
  return (
    <div className="flex flex-1 flex-col p-6 md:p-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <div className="grid gap-6 md:grid-cols-3">
            <WebVitalCardSkeleton />
            <WebVitalCardSkeleton />
            <WebVitalCardSkeleton />
          </div>
          <WhatMovedCardSkeleton />
          <LineChartCardSkeleton />
        </div>

        <div className="flex flex-col gap-6">
          <VisibilityBreakdownCardSkeleton />
          <AISuggestionsCardSkeleton />
          <BarChartCardSkeleton />
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   Hub table skeleton  (Performance hub page)
──────────────────────────────────────────────── */
export function HubTableSkeleton() {
  return (
    <SkeletonCard className="flex-1">
      <CardHeader>
        <Shimmer className="h-5 w-52 rounded-md" />
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-[#2d3748] overflow-hidden">
          {/* Header row */}
          <div className="flex items-center gap-4 px-4 py-3 bg-[#0f1419] border-b border-[#2d3748]">
            {[40, 20, 20, 15, 10, 12].map((w, i) => (
              <Skeleton key={i} className="h-3 rounded-full bg-[#2d3748]" style={{ width: `${w}%` }} />
            ))}
          </div>
          {/* Data rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-[#2d3748] last:border-b-0">
              {[40, 20, 20, 15, 10, 12].map((w, j) => (
                <Skeleton key={j} className="h-4 rounded-md bg-[#2d3748]" style={{ width: `${w}%` }} />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </SkeletonCard>
  );
}

/* ────────────────────────────────────────────────
   Performance KPI (detail page) skeleton
──────────────────────────────────────────────── */
export function PerformanceKPISkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 my-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}
