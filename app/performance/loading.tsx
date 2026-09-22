// Next.js App Router loading.tsx — shown while Performance Hub data loads

import { AppSidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/header";
import { StatCardSkeleton, HubTableSkeleton } from "@/components/Skeletons";

export default function PerformanceHubLoading() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-dash-surface">
        {/* Top progress bar */}
        <div className="fixed top-0 left-0 right-0 z-50 h-[3px]">
          <div className="h-full bg-gradient-to-r from-[#3ee0a1] via-[#06b6d4] to-[#8b5cf6] animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%]" />
        </div>

        <Header />

        <div className="flex flex-1 flex-col p-6 md:p-8 max-w-[1600px] mx-auto w-full">
          {/* Title skeleton */}
          <div className="h-7 w-48 rounded-md bg-[#2d3748] animate-pulse mb-2" />
          <div className="h-4 w-72 rounded-full bg-[#2d3748] animate-pulse" />

          {/* Hub metric cards */}
          <div className="grid gap-6 md:grid-cols-3 mb-8 mt-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>

          {/* Hub table */}
          <HubTableSkeleton />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
