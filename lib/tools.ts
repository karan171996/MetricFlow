import { Activity, Bug, type LucideIcon } from "lucide-react";
import type { MetricsPage, PageMetrics, Sources } from "@/lib/metricsHistory";
import { formatDuration } from "@/lib/formatDuration";

/** What a tool can provide. Screens ask "is this capability provided?", never "is this New Relic?". */
export const CAPABILITIES = ["pages", "traffic", "loadTime", "apdex", "vitals", "ajax", "errorRate", "errors"] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** One sidebar entry + one /tools/[id] page per data source. Add a tool here and both appear. */
export interface Tool {
  label: string;
  icon: LucideIcon;
  description: string;
  /** Shown on /tools/<id> when the tool is not connected. */
  connectReason: string;
  /** Optional line under the tool's group on /setup. */
  setupNote?: string;
  /**
   * Env keys that connect this tool: it is connected when every `required` key is set (see isToolConnected).
   * `derived`: names the server works out and saves itself (New Relic's region). Nothing else is ever written for a tool.
   */
  keys: { required: readonly string[]; optional: readonly string[]; derived?: readonly string[] };
  capabilities: readonly Capability[];
  /** Headline cards, computed from pages that have reported (see hasData). */
  stats: (live: MetricsPage[]) => { label: string; value: string }[];
  /** Per-page table columns, after the fixed Page / Path columns. `needs` names the capability a column shows. */
  columns: { needs: Capability; header: string; cell: (p: MetricsPage) => string }[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export const TOOLS = {
  "new-relic": {
    label: "New Relic",
    icon: Activity,
    description: "Real-user performance per page: load time, Core Web Vitals, throughput and Apdex.",
    connectReason: "Add your New Relic keys to see load time and Core Web Vitals for each page.",
    setupNote: "The key that sends events (Ingest - License) is separate and is added later on the Connect page.",
    keys: { required: ["NEWRELIC_API_KEY", "NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID"], optional: ["NEWRELIC_INSERT_KEY"], derived: ["NEWRELIC_REGION"] },
    capabilities: ["pages", "traffic", "loadTime", "apdex", "vitals", "ajax", "errorRate"],
    stats: (live) => [
      { label: "Avg Load Time", value: formatDuration(avg(live.map((p) => p.newRelic.loadTime))) },
      { label: "Avg LCP", value: formatDuration(avg(live.map((p) => p.newRelic.lcp))) },
      { label: "Avg TTFB", value: formatDuration(avg(live.map((p) => p.newRelic.ttfb))) },
      { label: "Avg Apdex", value: avg(live.map((p) => p.newRelic.apdexScore)).toFixed(2) },
    ],
    columns: [
      { needs: "loadTime", header: "Load", cell: (p) => formatDuration(p.newRelic.loadTime) },
      { needs: "vitals", header: "LCP", cell: (p) => formatDuration(p.newRelic.lcp) },
      { needs: "vitals", header: "TTFB", cell: (p) => formatDuration(p.newRelic.ttfb) },
      { needs: "vitals", header: "CLS", cell: (p) => p.newRelic.cls.toFixed(2) },
      { needs: "vitals", header: "INP", cell: (p) => (p.newRelic.inp === undefined ? "—" : formatDuration(p.newRelic.inp)) },
      { needs: "errorRate", header: "Error Rate", cell: (p) => `${p.newRelic.errorRate.toFixed(2)}%` },
      { needs: "traffic", header: "Throughput", cell: (p) => p.newRelic.throughput.toLocaleString() },
      { needs: "apdex", header: "Apdex", cell: (p) => p.newRelic.apdexScore.toFixed(2) },
    ],
  },
  sentry: {
    label: "Sentry",
    icon: Bug,
    description: "Errors captured per page over the last 24 hours.",
    connectReason: "Add your Sentry keys to see the errors on each page.",
    keys: { required: ["SENTRY_API_KEY", "SENTRY_DSN"], optional: [] },
    capabilities: ["errors"],
    stats: (live) => {
      const noisiest = live.reduce<MetricsPage | null>((top, p) => ((p.sentry?.errorCount ?? 0) > (top?.sentry?.errorCount ?? 0) ? p : top), null);
      return [
        { label: "Total Errors", value: String(sum(live.map((p) => p.sentry?.errorCount ?? 0))) },
        { label: "Pages With Errors", value: `${live.filter((p) => (p.sentry?.errorCount ?? 0) > 0).length} of ${live.length}` },
        { label: "Noisiest Page", value: noisiest?.name ?? "None" },
      ];
    },
    columns: [
      { needs: "errors", header: "Errors", cell: (p) => String(p.sentry?.errorCount ?? 0) },
      { needs: "errors", header: "Latest Error", cell: (p) => p.sentry?.latestErrors[0]?.title ?? "—" },
      { needs: "errors", header: "Last Seen", cell: (p) => { const t = Date.parse(p.sentry?.latestErrors[0]?.lastSeen ?? ""); return Number.isNaN(t) ? "—" : new Date(t).toLocaleString(); } },
    ],
  },
} satisfies Record<string, Tool>;

/** One /setup field per required env key: its label, whether to mask it, and the help line under it. */
export const KEY_FIELDS: Record<string, { label: string; secret: boolean; help: string }> = {
  NEWRELIC_API_KEY: { label: "New Relic User API key", secret: true, help: "READS your data (starts NRAK-). Create it under API keys > key type \"User\"." },
  NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID: { label: "New Relic account ID", secret: false, help: "A plain number, shown next to your keys in New Relic." },
  SENTRY_API_KEY: { label: "Sentry auth token", secret: true, help: "Lets the dashboard read issues (scopes: project:read, event:read)." },
  SENTRY_DSN: { label: "Sentry DSN", secret: false, help: "Project settings, then Client Keys (DSN). The project and host are read from it." },
};

/** Field labels for each env key, used by the setup form and its error messages. */
export const KEY_LABELS: Record<string, string> = Object.fromEntries(Object.entries(KEY_FIELDS).map(([name, f]) => [name, f.label]));

export type ToolId = keyof typeof TOOLS;
export const TOOL_IDS = Object.keys(TOOLS) as ToolId[];
export const isToolId = (id: string): id is ToolId => Object.hasOwn(TOOLS, id);

/** A tool's columns for the capabilities it declares. */
export const toolColumns = (id: ToolId): Tool["columns"] => {
  const { columns, capabilities }: Tool = TOOLS[id];
  return columns.filter((c) => capabilities.includes(c.needs));
};

/** Capability -> the tool that supplies it: the first connected tool in TOOLS order that declares it. A failed load does not change the answer. */
export function sourcesFor(connected: readonly ToolId[]): Sources {
  const sources: Sources = {};
  for (const cap of CAPABILITIES) {
    const id = TOOL_IDS.find((id) => connected.includes(id) && (TOOLS[id] as Tool).capabilities.includes(cap));
    if (id) sources[cap] = id;
  }
  return sources;
}

/** The merged view of one page: each capability copied whole from its supplier, or left out if that tool failed. Never mixed value by value. */
export function mergeMetrics(byTool: Partial<Record<ToolId, PageMetrics>>, sources: Sources, failed: readonly string[]): PageMetrics {
  const merged: Record<string, unknown> = {};
  for (const [cap, id] of Object.entries(sources) as [Capability, ToolId][]) {
    const value = failed.includes(id) ? undefined : (byTool[id] as Record<string, unknown> | undefined)?.[cap];
    if (value !== undefined) merged[cap] = value;
  }
  return merged as PageMetrics;
}
