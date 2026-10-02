import { Activity, Bug, type LucideIcon } from "lucide-react";
import type { MetricsPage } from "@/lib/metricsHistory";
import { formatDuration } from "@/lib/formatDuration";

/** One sidebar entry + one /tools/[id] page per data source. Add a tool here and both appear. */
export interface Tool {
  label: string;
  icon: LucideIcon;
  description: string;
  /** Headline cards, computed from pages that have reported (see hasData). */
  stats: (live: MetricsPage[]) => { label: string; value: string }[];
  /** Per-page table columns, after the fixed Page / Path columns. */
  columns: { header: string; cell: (p: MetricsPage) => string }[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export const TOOLS = {
  "new-relic": {
    label: "New Relic",
    icon: Activity,
    description: "Real-user performance per page: load time, Core Web Vitals, throughput and Apdex.",
    stats: (live) => [
      { label: "Avg Load Time", value: formatDuration(avg(live.map((p) => p.newRelic.loadTime))) },
      { label: "Avg LCP", value: formatDuration(avg(live.map((p) => p.newRelic.lcp))) },
      { label: "Avg TTFB", value: formatDuration(avg(live.map((p) => p.newRelic.ttfb))) },
      { label: "Avg Apdex", value: avg(live.map((p) => p.newRelic.apdexScore)).toFixed(2) },
    ],
    columns: [
      { header: "Load", cell: (p) => formatDuration(p.newRelic.loadTime) },
      { header: "LCP", cell: (p) => formatDuration(p.newRelic.lcp) },
      { header: "TTFB", cell: (p) => formatDuration(p.newRelic.ttfb) },
      { header: "CLS", cell: (p) => p.newRelic.cls.toFixed(2) },
      { header: "INP", cell: (p) => (p.newRelic.inp === undefined ? "—" : formatDuration(p.newRelic.inp)) },
      { header: "Error Rate", cell: (p) => `${p.newRelic.errorRate.toFixed(2)}%` },
      { header: "Throughput", cell: (p) => p.newRelic.throughput.toLocaleString() },
      { header: "Apdex", cell: (p) => p.newRelic.apdexScore.toFixed(2) },
    ],
  },
  sentry: {
    label: "Sentry",
    icon: Bug,
    description: "Errors captured per page over the last 24 hours.",
    stats: (live) => {
      const noisiest = live.reduce<MetricsPage | null>((top, p) => (p.sentry.errorCount > (top?.sentry.errorCount ?? 0) ? p : top), null);
      return [
        { label: "Total Errors", value: String(sum(live.map((p) => p.sentry.errorCount))) },
        { label: "Pages With Errors", value: `${live.filter((p) => p.sentry.errorCount > 0).length} of ${live.length}` },
        { label: "Noisiest Page", value: noisiest?.name ?? "None" },
      ];
    },
    columns: [
      { header: "Errors", cell: (p) => String(p.sentry.errorCount) },
      { header: "Latest Error", cell: (p) => p.sentry.latestErrors[0]?.title ?? "—" },
      { header: "Last Seen", cell: (p) => { const t = Date.parse(p.sentry.latestErrors[0]?.lastSeen ?? ""); return Number.isNaN(t) ? "—" : new Date(t).toLocaleString(); } },
    ],
  },
} satisfies Record<string, Tool>;

export type ToolId = keyof typeof TOOLS;
export const TOOL_IDS = Object.keys(TOOLS) as ToolId[];
export const isToolId = (id: string): id is ToolId => Object.hasOwn(TOOLS, id);
