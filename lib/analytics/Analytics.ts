import { createHash } from 'node:crypto';
import axios from 'axios';
import { normalizePath } from '@/lib/discoverPages';
import { recordTiming } from '@/lib/apiTimingStore';
import type { NrRegion } from '@/lib/env';
import type { PageMetrics } from '@/lib/metricsHistory';
import { TOOLS, type ToolId } from '@/lib/tools';

export type KeyResult = { ok: true; region?: NrRegion; notice?: string } | { ok: false; error: string; notice?: string };

/** One fetch of the last 24h. */
export interface ToolRead {
  /** Present only for a tool with the `pages` capability. Raw rows; the route runs buildPages once. */
  pages?: { url: string; views: number }[];
  /** This tool's numbers per normalised path. */
  byPath: Record<string, PageMetrics>;
  /** @deprecated Vendor-shaped rows behind the deprecated `newRelic` / `sentry` page fields. Removed in C3. */
  legacy: Record<string, object>;
}
/** A `ToolRead` from `poll()`; `fresh` is false when it came from the memo (or an in-flight read). */
export type Polled = ToolRead & { fresh: boolean };

export interface ToolUpdate {
  results: Record<string, KeyResult>;
  /** Extra values to persist when every result is ok. The route drops any name not in TOOLS[id].keys.derived. */
  derived?: Record<string, string>;
}

export const POLL_TTL_MS = 25_000;

/** Never include the thrown axios error: its config carries the key in headers. */
export function describeFailure(e: unknown, what: string): string {
  const status = axios.isAxiosError(e) ? e.response?.status : undefined;
  if (status === 401 || status === 403) return `${what} was rejected (check the key and its permissions).`;
  if (status === 404) return `${what} was not found.`;
  return `Could not reach ${what} to check it.`;
}

/**
 * Abstract base for metrics sources (New Relic, Sentry): the server half of the tool contract.
 * `read` fetches, `poll` is `read` memoised for POLL_TTL_MS, `update` checks one key group.
 * Shared: path normalization, merging query-string variants, percentages, weighted averages.
 */
export abstract class Analytics<TRaw extends Record<string, unknown>, TPage> {
  abstract readonly id: ToolId;
  /** Label under which a fresh read is timed in the "MetricFlow API response times" card. */
  protected abstract readonly timingLabel: string;
  /** @deprecated Name of the vendor-shaped page field this tool fills. Removed in C3. */
  abstract readonly legacyField: 'newRelic' | 'sentry';

  // ponytail: single slot per tool; a map would keep old keys alive. Holds a hash of the keys, never the keys.
  private slot: { key: string; at: number; promise: Promise<ToolRead> } | null = null;

  /** Fetches this tool's data. May throw anything: `read` turns that into a fixed-text error. */
  protected abstract load(): Promise<ToolRead>;
  /** The key values this tool reads, for the memo to notice a change. Hashed, never stored or logged. */
  protected abstract memoKey(): string;
  /** What "no row for this page" means for this tool. */
  abstract emptyPage(): { metrics: PageMetrics; legacy: TPage };
  /** Checks this tool's key group against the vendor. Writes nothing. */
  abstract update(values: Record<string, string>): Promise<ToolUpdate>;

  /** Throws on any failure (fixed text, no `cause`): an empty result must mean "no data", never "request failed". */
  async read(): Promise<ToolRead> {
    const start = performance.now();
    try {
      const result = await this.load();
      recordTiming(this.timingLabel, performance.now() - start);
      return result;
    } catch (error) {
      // Only the status is logged: an axios error carries the request config, and so the key.
      console.error(`[tool] ${this.id} read failed`, axios.isAxiosError(error) ? (error.response?.status ?? 'no response') : 'no response');
      throw new Error(`Could not load ${TOOLS[this.id].label} data.`);
    }
  }

  /** `read`, reused for POLL_TTL_MS while the keys are unchanged, and shared while in flight. A failure is not kept. */
  poll(): Promise<Polled> {
    const key = createHash('sha256').update(this.memoKey()).digest('hex');
    const held = this.slot;
    if (held && held.key === key && (held.at === 0 || Date.now() - held.at < POLL_TTL_MS)) {
      return held.promise.then(r => ({ ...r, fresh: false }));
    }
    const slot = { key, at: 0, promise: this.read() };
    this.slot = slot;
    return slot.promise.then(
      r => {
        slot.at = Date.now();
        return { ...r, fresh: true };
      },
      error => {
        if (this.slot === slot) this.slot = null;
        throw error;
      }
    );
  }

  /** Group already-fetched rows by normalized path and merge each path's variants. */
  protected aggregateRows(rows: TRaw[]): Record<string, TPage> {
    if (!rows || rows.length === 0) return {};
    const result: Record<string, TPage> = {};
    for (const [path, rowsForPath] of Object.entries(this.groupByPath(rows))) {
      const merged = this.mergeVariants(rowsForPath);
      if (merged) result[path] = merged;
    }
    return result;
  }

  /** Fetch raw data from the API. Throws on failure. */
  protected abstract fetchRows(): Promise<TRaw[]>;

  /** Subclass defines how to merge query-string variants of one path into a single metric. */
  protected abstract mergeVariants(rowsForOnePath: TRaw[]): TPage | null;

  /** Group rows by their normalized page path. */
  protected groupByPath(rows: TRaw[]): Record<string, TRaw[]> {
    const byPath: Record<string, TRaw[]> = {};
    for (const row of rows) {
      const path = this.pathOf(row);
      if (path === null) continue;
      (byPath[path] ??= []).push(row);
    }
    return byPath;
  }

  /** Extract and normalize the page path from a raw API row. */
  protected pathOf(row: TRaw): string | null {
    const url = String((row.pageUrl as unknown) ?? (row.url as unknown) ?? (row.facet as unknown) ?? '');
    return normalizePath(url);
  }

  /** Weighted average: sum(values[i] * weights[i]) / sum(weights). */
  protected weightedAverage(values: number[], weights: number[]): number {
    if (values.length === 0) return 0;
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight === 0) return 0;
    const weightedSum = values.reduce((sum, v, i) => sum + v * (weights[i] ?? 0), 0);
    return weightedSum / totalWeight;
  }

  /** Safe percent: (part / whole) * 100, or 0 if whole is 0 or falsy. */
  protected percent(part: number, whole: number): number {
    return whole ? (part / whole) * 100 : 0;
  }

  /** Safe divide: a / b, or 0 if b is 0 or falsy. */
  protected safeDivide(numerator: number, denominator: number): number {
    return denominator ? numerator / denominator : 0;
  }
}
