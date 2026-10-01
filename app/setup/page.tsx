import { AppSidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/header";
import { SetupForm } from "@/components/Setup";

export default function SetupPage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-dash-surface">
        <Header />
        <div className="flex flex-1 flex-col p-6 md:p-8 max-w-[1600px] mx-auto w-full">
          <h1 className="text-2xl font-bold text-white tracking-tight mb-2">Setup</h1>
          <p className="text-sm text-gray-400 mb-6">Add your keys once to see real data. Nothing is sent anywhere except New Relic and Sentry.</p>
          <SetupForm />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
