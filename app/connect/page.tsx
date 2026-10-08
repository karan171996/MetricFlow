import { AppSidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/header";
import { ConnectPage } from "@/components/Connect";

export default function ConnectRoute() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-dash-surface">
        <Header />
        <div className="flex flex-1 flex-col p-6 md:p-8 max-w-[1600px] mx-auto w-full">
          <h1 className="title-enter text-2xl font-bold text-white tracking-tight mb-2">Connect your app</h1>
          <p className="text-sm text-gray-400 mb-6">Add one call to your site so its metrics and errors show up here.</p>
          <ConnectPage />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
