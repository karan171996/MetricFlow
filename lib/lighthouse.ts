import { normalizePath } from '@/lib/discoverPages';
import type { PageMetrics } from '@/lib/metricsHistory';

const MAX_RUNS = 500;

type Lighthouse = NonNullable<PageMetrics['lighthouse']>;
interface Run { path: string; fetchTime: string; score: number; lighthouse: Lighthouse }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** One audit's numericValue, or undefined: a missing or non-numeric audit stays absent, never 0. */
function audit(audits: Record<string, unknown>, id: string): number | undefined {
  const a = audits[id];
  return isObj(a) && finite(a.numericValue) ? a.numericValue : undefined;
}

function toRun(report: unknown): Run | null {
  if (!isObj(report) || !isObj(report.categories) || !isObj(report.audits)) return null;
  const perf = report.categories.performance;
  if (!isObj(perf) || report.runtimeError || !finite(perf.score)) return null;
  // Host is ignored on purpose: a report of production's /pricing is shown on this machine's /pricing.
  const url = [report.finalDisplayedUrl, report.finalUrl, report.requestedUrl].find(u => typeof u === 'string' && u) as string | undefined;
  const path = url ? normalizePath(url) : null;
  if (path === null) return null;
  const lighthouse: Lighthouse = { score: Math.min(100, Math.max(0, Math.round(perf.score * 100))) };
  for (const [key, id] of [['lcp', 'largest-contentful-paint'], ['cls', 'cumulative-layout-shift'], ['tbt', 'total-blocking-time']] as const) {
    const v = audit(report.audits, id);
    if (v !== undefined) lighthouse[key] = v;
  }
  return { path, fetchTime: typeof report.fetchTime === 'string' ? report.fetchTime : '', score: lighthouse.score!, lighthouse };
}

/**
 * Lighthouse reports (one LHR or an array) to metrics per normalised path. Non-reports and failed runs are skipped.
 * Several runs of one path (query strings merge): the lower median by score, the whole run, never a per-metric mix.
 */
export function parseLighthouse(reports: unknown): Record<string, PageMetrics> {
  const list = (Array.isArray(reports) ? reports : [reports]).slice(0, MAX_RUNS);
  const groups: Record<string, Run[]> = {};
  for (const r of list) {
    const run = toRun(r);
    if (run) (groups[run.path] ??= []).push(run);
  }
  return Object.fromEntries(Object.entries(groups).map(([path, runs]) => {
    runs.sort((a, b) => a.score - b.score || (a.fetchTime < b.fetchTime ? -1 : a.fetchTime > b.fetchTime ? 1 : 0));
    return [path, { lighthouse: runs[Math.floor((runs.length - 1) / 2)].lighthouse } satisfies PageMetrics];
  }));
}
