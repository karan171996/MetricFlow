import { AppSidebar } from "@/components/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Header } from "@/components/header";

const stats = [
  {
    label: "Avg Response Time",
    value: "124ms",
    change: "-12% from last hour",
    changeClass: "text-dash-success",
  },
  {
    label: "Error Rate",
    value: "0.08%",
    change: "+0.02% from last hour",
    changeClass: "text-dash-warning",
  },
  {
    label: "Throughput",
    value: "2.4k/s",
    change: "+8% from last hour",
    changeClass: "text-dash-success-cyan",
  },
  {
    label: "Apdex Score",
    value: "0.94",
    change: "Stable",
    changeClass: "text-dash-blue",
  },
];

export default function Home() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-dash-surface">
        <Header />
        <div className="flex flex-1 flex-col p-6 md:p-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-dash-border bg-dash-card p-5"
              >
                <p className="text-label text-dash-muted">{stat.label}</p>
                <p className="mt-2 text-h2 text-dash-foreground">{stat.value}</p>
                <p className={`mt-1 text-body-sm ${stat.changeClass}`}>
                  {stat.change}
                </p>
              </div>
            ))}
          </div>

          <section className="mt-8 flex-1 rounded-lg border border-dash-border bg-dash-card p-6">
            <h2 className="text-dash-foreground">Overview</h2>
            <p className="mt-2 text-body text-dash-muted">
              Chart and metrics visualization will appear here.
            </p>
          </section>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
