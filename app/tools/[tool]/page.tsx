import { notFound } from "next/navigation";
import { AppSidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/header";
import { ToolInsights } from "@/components/ToolInsights/ToolInsights";
import { TOOLS, isToolId } from "@/lib/tools";

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

          <ToolInsights tool={tool} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
