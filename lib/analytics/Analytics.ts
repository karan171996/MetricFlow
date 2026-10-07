import { normalizePath } from '@/lib/discoverPages';

/**
 * Abstract base for metrics sources (New Relic, Sentry).
 * Shared: path normalization, merging query-string variants, percentages, weighted averages.
 * Subclasses define fetchRows, how to merge variants per path, and the empty result shape.
 */
export abstract class Analytics<TRaw extends Record<string, unknown>, TPage> {
  /**
   * Main flow: fetch raw data -> group by normalized path -> merge variants per path -> return.
   */
  async byPath(): Promise<Record<string, TPage>> {
    try {
      return this.aggregateRows(await this.fetchRows());
    } catch (error) {
      this.onError(error);
      return {};
    }
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

  /** Fetch raw data from API. Must handle errors and return empty array on failure. */
  protected abstract fetchRows(): Promise<TRaw[]>;

  /** Subclass defines how to merge query-string variants of one path into a single metric. */
  protected abstract mergeVariants(rowsForOnePath: TRaw[]): TPage | null;

  /** Called on exception. Default logs to console; override to use a specific logger. */
  protected onError(error: unknown): void {
    console.error(`${this.constructor.name} fetch failed:`, error);
  }

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
