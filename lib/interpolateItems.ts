/** Cubic ease-out: fast start, slow finish. 0 -> 0, 1 -> 1. */
export const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Values to show at progress `t` (0..1) while moving from `from` to each item's value.
 * Names missing in `from` start at 0. At t >= 1 the result is the exact item value
 * (no float arithmetic), so the last frame never drifts.
 */
export function interpolateItems(
  items: { name: string; value: number }[],
  from: Record<string, number>,
  t: number
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { name, value } of items) {
    const start = from[name] ?? 0;
    out[name] = t >= 1 ? value : start + (value - start) * t;
  }
  return out;
}
