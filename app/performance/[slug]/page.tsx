import { AppSidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/header";
import { notFound } from "next/navigation";
import { discoverPages } from "@/lib/newrelic";
import { env, isConfigured } from "@/lib/env";
import { PerformanceDetail } from "@/components/Analytics";

export const dynamic = "force-dynamic";

export default async function PerformanceDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (isConfigured()) {
    // A real 404 for unknown slugs. If New Relic is unreachable, fall through so the client shows its error card.
    const pages = await discoverPages(env("NEWRELIC_API_KEY"), env("NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID")).catch(() => null);
    if (pages && pages.length && !pages.some((p) => p.slug === slug)) notFound();
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-dash-surface">
        <Header />
        <div className="flex flex-1 flex-col p-6 md:p-8 max-w-[1600px] mx-auto w-full">
          <PerformanceDetail slug={slug} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
