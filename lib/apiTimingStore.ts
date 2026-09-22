import type { TrafficBarItem } from '@/types';

/**
 * Holds the most recent measured duration of each named external API call
 * (New Relic, Sentry per-page, Gemini), recorded by the route handlers
 * that actually make those calls. Powers the "Rankings Moved" card, which
 * shows real call latency ranked slowest-first instead of SEO data (no
 * connected platform has ranking data — this does the same "ranked bars"
 * job with something we actually measure).
 *
 * ponytail: in-memory, single-process — resets on dev server restart and
 * isn't shared across serverless instances. Fine for local dev; upgrade
 * to a real store if this needs to survive restarts or aggregate across
 * instances.
 */
const timings = new Map<string, number>();

export function recordTiming(name: string, ms: number) {
  timings.set(name, Math.round(ms));
}

export function getTimings(): TrafficBarItem[] {
  return Array.from(timings.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}
