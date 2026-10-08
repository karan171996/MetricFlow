import { basename } from 'node:path';
import { SERVER_TOOLS } from '@/lib/analytics';
import { buildPages } from '@/lib/discoverPages';
import { connectedTools, env } from '@/lib/env';
import { recordSnapshot, getHistory, type MetricsPage, type PageMetrics } from '@/lib/metricsHistory';
import { mergeMetrics, sourcesFor, TOOLS } from '@/lib/tools';
import type { PageStatus } from '@/types';

export async function GET() {
  const tools = connectedTools();
  // Which tool supplies each capability. Decided by what is connected, not by what loaded.
  const sources = sourcesFor(tools);
  if (!tools.length) {
    return Response.json({ configured: false, tools, sources, project: projectName(), pages: [], history: [], timestamp: new Date().toISOString() });
  }
  // Without a tool that lists pages there is nothing to list yet (a Sentry-only page list is a later change).
  const pagesTool = sources.pages;
  if (!pagesTool) {
    return Response.json({ configured: true, tools, sources, project: projectName(), pages: [], history: [], timestamp: new Date().toISOString() });
  }

  const routeStart = performance.now();
  // The tools are independent, so poll them concurrently. A rejection reason is never read: only "failed or not".
  const settled = await Promise.allSettled(tools.map(id => SERVER_TOOLS[id].poll()));
  const failed: string[] = tools.filter((_, i) => settled[i].status === 'rejected');
  console.log(`[timing] combined tool batch: ${Math.round(performance.now() - routeStart)}ms`);

  // No rows can be listed without the pages supplier.
  if (failed.includes(pagesTool)) {
    return Response.json({ error: `Could not load ${TOOLS[pagesTool].label} data.` }, { status: 500 });
  }

  const reads = Object.fromEntries(tools.flatMap((id, i) => {
    const s = settled[i];
    return s.status === 'fulfilled' ? [[id, s.value] as const] : [];
  }));

  const trackedPages = buildPages(reads[pagesTool].pages ?? []);
  if (trackedPages.length === 0) {
    return Response.json({ configured: true, tools, sources, project: projectName(), pages: [], history: getHistory(), timestamp: new Date().toISOString() });
  }

  // The deprecated vendor-named fields (`newRelic`, `sentry`) are still filled, from each tool's `legacy` rows, until C3.
  const pages: MetricsPage[] = trackedPages.map(({ name, slug, url, views }) => {
    const byTool: MetricsPage['byTool'] = {};
    const legacy: Record<string, object> = {};
    for (const id of tools) {
      if (failed.includes(id)) continue;
      const tool = SERVER_TOOLS[id];
      const row = reads[id].legacy[url] ? { metrics: reads[id].byPath[url], legacy: reads[id].legacy[url] } : tool.emptyPage();
      byTool[id] = row.metrics;
      legacy[tool.legacyField] = row.legacy;
    }
    const metrics = mergeMetrics(byTool, sources, failed);
    return {
      name,
      slug,
      url,
      visitors: formatVisitors(views),
      status: deriveStatus(metrics),
      ...legacy,
      recordedAt: new Date().toISOString(),
      metrics,
      byTool
    };
  });

  // Only a fresh read adds to the history: a memo hit would fill the ring with duplicates.
  if (Object.values(reads).some(r => r.fresh)) recordSnapshot(pages, sources);

  return Response.json({ configured: true, tools, failed, sources, project: projectName(), pages, history: getHistory(), timestamp: new Date().toISOString() });
}

/** Unchanged rule (error rate 1% and 5%, Apdex 0.9), now read off the merged view; absent unless both inputs are there. */
function deriveStatus(m: PageMetrics): PageStatus | undefined {
  if (m.errorRate === undefined || m.apdex === undefined) return undefined;
  if (m.errorRate > 5) return 'Critical';
  if (m.errorRate > 1 || m.apdex < 0.9) return 'Warning';
  return 'Healthy';
}

/** Header title: the host project's package.json name, passed in by bin/cli.mjs. Under `next dev` it is this folder's name. */
function projectName(): string {
  return env('METRICFLOW_PROJECT_NAME') || basename(process.cwd());
}

function formatVisitors(throughput: number): string {
  if (throughput >= 1000) return `${(throughput / 1000).toFixed(1)}k`;
  return String(throughput);
}
