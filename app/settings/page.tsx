import { AppSidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ApiKeys,
  ExportSettings,
  ThresholdSettings,
  NotificationPrefs,
  ThreeDPrefs
  // TeamMembers, // later: team access feature
} from "@/components/Settings";

const TABS = ["general", "thresholds", "team"];

/** `?tab=thresholds` opens that tab (the dashboard banner's "Edit limits" link). Anything else opens the first one. */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { tab } = await searchParams;
  const openTab = typeof tab === "string" && TABS.includes(tab) ? tab : "general";
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-dash-surface">
        <Header />
        <div className="flex flex-1 flex-col p-6 md:p-8 max-w-[1200px] mx-auto w-full">
          <div className="mb-8">
            <h1 className="title-enter text-2xl font-bold text-white tracking-tight">Settings</h1>
            <p className="text-sm text-gray-400">Manage your account, team, and dashboard preferences.</p>
          </div>

          <Tabs defaultValue={openTab} className="w-full">
            <TabsList className="bg-[#0f1419] border border-[#2d3748] mb-8 p-1 h-auto">
              <TabsTrigger value="general" className="data-[state=active]:bg-[#1a202c] data-[state=active]:text-white text-gray-400">
                General & API
              </TabsTrigger>
              <TabsTrigger value="thresholds" className="data-[state=active]:bg-[#1a202c] data-[state=active]:text-white text-gray-400">
                Performance Thresholds
              </TabsTrigger>
              <TabsTrigger value="team" className="data-[state=active]:bg-[#1a202c] data-[state=active]:text-white text-gray-400">
                Notifications & Team
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-6 mt-0">
              <ApiKeys />
              <ExportSettings />
              <ThreeDPrefs />
            </TabsContent>

            <TabsContent value="thresholds" className="mt-0">
              <ThresholdSettings />
            </TabsContent>

            <TabsContent value="team" className="space-y-6 mt-0">
              <NotificationPrefs />
              {/* Later: team access feature
              <TeamMembers />
              */}
            </TabsContent>
          </Tabs>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
