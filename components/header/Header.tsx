"use client";

import { Bell } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { Logo } from "@/components/Logo";
import { ThresholdAlert } from "./ThresholdAlert";
import { useMetrics, hasData, showsSentry, type MetricsState } from "@/lib/useMetrics";

/** Live facts about the monitored project; says so plainly when there is nothing to show yet. */
function subtitle(state: MetricsState): string {
  if (state.status === "loading") return "Loading…";
  if (state.status === "error") return "Could not load metrics";
  if (!state.configured) return "Not connected yet";
  // Sentry-only has no page list yet, so "0 open errors" would be a number nobody measured.
  if (!state.tools.includes("new-relic")) return "Sentry connected · add New Relic to list pages";
  const live = state.pages.filter(hasData);
  const views = state.pages.reduce((s, p) => s + p.newRelic.throughput, 0);
  const errors = state.pages.reduce((s, p) => s + (p.sentry?.errorCount ?? 0), 0);
  // Join only the parts that exist, so an unconnected tool leaves no gap or stray separator.
  return [
    state.tools.includes("new-relic") && `${live.length} of ${state.pages.length} pages reporting`,
    state.tools.includes("new-relic") && `${views.toLocaleString()} views in 24h`,
    showsSentry(state) && `${errors} open ${errors === 1 ? "error" : "errors"}`,
    state.failed.includes("sentry") && "Could not load Sentry data.",
    state.timestamp && `updated ${new Date(state.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
  ].filter(Boolean).join(" · ");
}

export function Header() {
  const { toggleSidebar } = useSidebar();
  const { state } = useMetrics();

  return (
    <>
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

      {/* Notification Bell */}
      <div className="flex items-center gap-2 md:gap-4">
        <button className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[#1a202c] text-gray-400 hover:text-white transition-colors">
          <Bell className="h-5 w-5" />
          {/* Notification Dot */}
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-[#0f1419]" />
        </button>
      </div>
    </header>
    <ThresholdAlert />
    </>
  );
}
