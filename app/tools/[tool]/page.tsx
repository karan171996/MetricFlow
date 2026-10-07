import { notFound } from "next/navigation";
import { AppSidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/header";
import { ToolInsights } from "@/components/ToolInsights/ToolInsights";
import { TOOLS, isToolId } from "@/lib/tools";
import { isToolConnected } from "@/lib/env";
import { EmptyState } from "@/components/EmptyState";

// Connected state depends on .env.local, which can change without a rebuild.
export const dynamic = "force-dynamic";

const CONNECT_REASON = {
  "new-relic": "Add your New Relic keys to see load time and Core Web Vitals for each page.",
  sentry: "Add your Sentry keys to see the errors on each page.",
} as const;

export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  if (!isToolId(tool)) notFound();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-dash-surface">
        <Header />
        <div className="flex flex-1 flex-col p-6 md:p-8 max-w-[1600px] mx-auto w-full">
          <h1 className="text-2xl font-bold text-white tracking-tight mb-2">{TOOLS[tool].label}</h1>
          <p className="text-sm text-gray-400">{TOOLS[tool].description}</p>

          {isToolConnected(tool) ? (
            <ToolInsights tool={tool} />
          ) : (
            <div className="mt-6">
              <EmptyState title={`Connect ${TOOLS[tool].label}`} reason={CONNECT_REASON[tool]} href={`/setup#${tool}`} cta={`Add ${TOOLS[tool].label} keys`} />
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
