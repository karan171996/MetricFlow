import { AppSidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/header";
import {
  PerformanceBreadcrumb,
  PerformanceKPIs,
  PerformanceCharts,
  HourlyBreakdownTable,
  RelatedErrorsList
} from "@/components/Analytics";

export default async function PerformanceDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pageName = slug.charAt(0).toUpperCase() + slug.slice(1);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-dash-surface">
        <Header />
        <div className="flex flex-1 flex-col p-6 md:p-8 max-w-[1600px] mx-auto w-full">
          {/* Top Breadcrumb Nav */}
          <PerformanceBreadcrumb pageName={pageName} />

          {/* High Level KPI Cards */}
          <PerformanceKPIs />

          {/* 3 Detailed Charts Row */}
          <PerformanceCharts />

          {/* Table & Errors List Row */}
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            <HourlyBreakdownTable />
            <RelatedErrorsList />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
