// Next.js App Router loading.tsx — automatically shown as a page-level loader
// while the root dashboard page is fetching / suspending.

import { AppSidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/header";
import { DashboardBodySkeleton } from "@/components/Skeletons";

export default function DashboardLoading() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-dash-surface">
        {/* Top progress bar */}
        <div className="fixed top-0 left-0 right-0 z-50 h-[3px]">
          <div className="h-full bg-gradient-to-r from-[#3ee0a1] via-[#06b6d4] to-[#8b5cf6] animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%]" />
        </div>

        <Header />
        <DashboardBodySkeleton />
      </SidebarInset>
    </SidebarProvider>
  );
}
