"use client";

import { Search, Bell } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSidebar } from "@/components/ui/sidebar";
import { Logo } from "@/components/Logo";
import { useMetrics, hasData, type MetricsState } from "@/lib/useMetrics";

/** Live facts about the monitored project; says so plainly when there is nothing to show yet. */
function subtitle(state: MetricsState): string {
  if (state.status === "loading") return "Loading…";
  if (state.status === "error") return "Could not load metrics";
  if (!state.configured) return "Not connected yet";
  const live = state.pages.filter(hasData);
  const views = state.pages.reduce((s, p) => s + p.newRelic.throughput, 0);
  const errors = state.pages.reduce((s, p) => s + p.sentry.errorCount, 0);
  const updated = state.timestamp ? ` · updated ${new Date(state.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "";
  return `${live.length} of ${state.pages.length} pages reporting · ${views.toLocaleString()} views in 24h · ${errors} open ${errors === 1 ? "error" : "errors"}${updated}`;
}

export function Header() {
  const { toggleSidebar } = useSidebar();
  const { state } = useMetrics();

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-gray-800 bg-[#0f1419] px-4 md:px-6">
      {/* Title & Subtitle */}
      <div className="hidden md:block flex flex-col gap-0.5">
        <h1 className="text-base md:text-lg font-semibold text-white tracking-tight line-clamp-1">
          {(state.status === "ready" && state.project) || "MetricFlow"}
        </h1>
        <p className="hidden sm:block text-xs text-gray-400">
          {subtitle(state)}
        </p>
      </div>

      <button 
        onClick={toggleSidebar}
        className="md:hidden flex h-10 w-10 items-center justify-center rounded-lg bg-[#3ee0a1] text-black hover:bg-[#3ee0a1]/90 transition-colors"
      >
        <Logo className="h-7 w-7" />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search Bar & Notification Bell */}
      <div className="flex items-center gap-2 md:gap-4">
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="search"
            placeholder="Search..."
            className="w-40 md:w-64 bg-[#1a202c] border-none text-sm text-gray-200 placeholder:text-gray-500 pl-10 focus-visible:ring-1 focus-visible:ring-gray-600 rounded-full h-9"
          />
        </div>

        {/* Mobile Search Icon Only */}
        <button className="sm:hidden relative flex h-9 w-9 items-center justify-center rounded-full bg-[#1a202c] text-gray-400 hover:text-white transition-colors">
          <Search className="h-4 w-4" />
        </button>

        <button className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[#1a202c] text-gray-400 hover:text-white transition-colors">
          <Bell className="h-5 w-5" />
          {/* Notification Dot */}
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-[#0f1419]" />
        </button>
      </div>
    </header>
  );
}
