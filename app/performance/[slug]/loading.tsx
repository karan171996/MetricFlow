// Next.js App Router loading.tsx — shown for /performance/[slug] while
// the specific page data is being fetched.

import { AppSidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/header";
import { PerformanceKPISkeleton, LineChartCardSkeleton, BarChartCardSkeleton } from "@/components/Skeletons";

export default function PerformanceDetailsLoading() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-dash-surface">
        {/* Top progress bar */}
        <div className="fixed top-0 left-0 right-0 z-50 h-[3px]">
          <div className="h-full bg-gradient-to-r from-[#3ee0a1] via-[#06b6d4] to-[#8b5cf6] animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%]" />
        </div>

        <Header />

        <div className="flex flex-1 flex-col p-6 md:p-8">
          {/* Breadcrumb skeleton */}
          <div className="flex items-center gap-2 mb-6">
            <div className="h-4 w-20 rounded-full bg-[#2d3748] animate-pulse" />
            <div className="h-3 w-3 rounded-full bg-[#2d3748] animate-pulse" />
            <div className="h-4 w-28 rounded-full bg-[#2d3748] animate-pulse" />
          </div>

          {/* KPI row */}
          <PerformanceKPISkeleton />

          {/* Charts */}
          <div className="grid gap-6 md:grid-cols-2 mt-6">
            <LineChartCardSkeleton />
            <LineChartCardSkeleton />
          </div>
          <div className="mt-6">
            <BarChartCardSkeleton />
          </div>

          {/* Hourly table */}
          <div className="mt-6 rounded-xl border border-[#2d3748] bg-[#1a202c] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#2d3748] bg-[#0f1419]">
              <div className="h-5 w-44 rounded-md bg-[#2d3748] animate-pulse" />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-3 border-b border-[#2d3748] last:border-b-0">
                {[20, 25, 20, 15, 20].map((w, j) => (
                  <div
                    key={j}
                    className="h-4 rounded-md bg-[#2d3748] animate-pulse"
                    style={{ width: `${w}%` }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
