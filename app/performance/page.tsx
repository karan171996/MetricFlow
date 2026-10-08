import { AppSidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/header";
import { PerformanceHub } from "@/components/PerformanceHub";

export default function PerformanceHubPage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-dash-surface">
        <Header />
        <div className="flex flex-1 flex-col p-6 md:p-8 max-w-[1600px] mx-auto w-full">
          <h1 className="title-enter text-2xl font-bold text-white tracking-tight mb-2">Performance Hub</h1>
          <p className="text-sm text-gray-400">Overview of all tracked pages and their current health status.</p>
          
          <PerformanceHub />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
