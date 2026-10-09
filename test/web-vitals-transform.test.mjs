// The TTFB/LCP/CLS cards and the breakdown card show a delta only against a real prior value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const t = await load("lib/dashboardTransforms.ts");
const has = () => true;
const page = (vitals) => ({ url: "/a", metrics: { vitals, apdex: 0.9, loadTime: 800 } });
const snap = (vitals) => ({ timestamp: "2026-01-01T10:00:00Z", pages: [page(vitals)] });
const now = { ttfb: 200, lcp: 2000, cls: 0.1 };
/** [change, direction, isPositive, color] of each card, for the current vitals `now` after the given earlier snapshots. */
const cards = (...earlier) => {
  const out = t.computeWebVitals([page(now)], [...earlier, snap(now)], has);
  return Object.fromEntries(Object.entries(out).map(([k, c]) => [k, [c.change, c.direction, c.isPositive, c.color]]));
};
const none = ["No prior data yet", null, null, "#9ca3af"];

test("web vitals: no history at all gives no delta", () => {
  assert.deepEqual(t.computeWebVitals([page(now)], [], has).ttfb.change, "No prior data yet");
  assert.deepEqual(cards(), { ttfb: none, lcp: none, cls: none });
});

test("web vitals: a prior snapshot without the vital gives no delta for that vital", () => {
  assert.deepEqual(cards(snap(undefined)), { ttfb: none, lcp: none, cls: none });
  assert.deepEqual(cards(snap({ ttfb: 200 })), { ttfb: ["No change", null, null, "#9ca3af"], lcp: none, cls: none });
});

test("web vitals: a decrease is a green down arrow, an increase a red up arrow", () => {
  assert.deepEqual(cards(snap({ ttfb: 250, lcp: 1500, cls: 0.1 })), {
    ttfb: ["50ms", "down", true, "#3ee0a1"],
    lcp: ["500ms", "up", false, "#ef4444"],
    cls: ["No change", null, null, "#9ca3af"],
  });
  assert.deepEqual(cards(snap({ cls: 0.04 })).cls, ["0.06", "up", false, "#ef4444"]);
});

test("breakdown card: no delta without a prior snapshot, a real one with it", () => {
  const first = t.computeVisibilityBreakdown([page(now)], [snap(now)], has);
  assert.deepEqual([first.scoreDelta, ...first.stats.map((s) => s.delta)], [null, null, null]);
  const second = t.computeVisibilityBreakdown([page(now)], [{ timestamp: "2026-01-01T09:00:00Z", pages: [{ url: "/a", metrics: { apdex: 0.8, loadTime: 1200 } }] }, snap(now)], has);
  assert.deepEqual([second.scoreDelta, ...second.stats.map((s) => s.delta)], [10, 1, 1]);
});
