// Next.js App Router loading.tsx — shown for /settings while the page loads.

import { AppSidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/header";
import { Skeleton } from "@/components/ui/skeleton";

function SettingsSectionSkeleton() {
  return (
    <div className="rounded-xl border border-[#2d3748] bg-[#1a202c] p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded-full bg-[#2d3748]" />
        <Skeleton className="h-5 w-40 rounded-md bg-[#2d3748]" />
      </div>
      <Skeleton className="h-3 w-64 rounded-full bg-[#2d3748]" />
      <div className="space-y-3 pt-2">
        <Skeleton className="h-10 w-full max-w-md rounded-lg bg-[#2d3748]" />
        <Skeleton className="h-9 w-32 rounded-lg bg-[#2d3748]" />
      </div>
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-dash-surface">
        {/* Top progress bar */}
        <div className="fixed top-0 left-0 right-0 z-50 h-[3px]">
          <div className="h-full bg-gradient-to-r from-[#3ee0a1] via-[#06b6d4] to-[#8b5cf6] animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%]" />
        </div>

        <Header />

        <div className="flex flex-1 flex-col p-6 md:p-8 max-w-[1200px] mx-auto w-full">
          {/* Page title */}
          <div className="mb-8 space-y-2">
            <Skeleton className="h-8 w-32 rounded-md bg-[#2d3748]" />
            <Skeleton className="h-4 w-64 rounded-full bg-[#2d3748]" />
          </div>

          {/* Tabs row */}
          <div className="flex gap-2 mb-8">
            {[120, 180, 160].map((w, i) => (
              <Skeleton key={i} className="h-9 rounded-md bg-[#2d3748]" style={{ width: w }} />
            ))}
          </div>

          {/* Settings sections */}
          <div className="space-y-6">
            <SettingsSectionSkeleton />
            <SettingsSectionSkeleton />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
