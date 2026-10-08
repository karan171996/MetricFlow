import { AppSidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/header";
import { notFound } from "next/navigation";
import { listedSlugs } from "@/lib/pageList";
import { PerformanceDetail } from "@/components/Analytics";

export const dynamic = "force-dynamic";

export default async function PerformanceDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // A real 404 for unknown slugs. If the page list cannot be read, fall through so the client shows its error card.
  const slugs = await listedSlugs();
  if (slugs?.length && !slugs.includes(slug)) notFound();

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
