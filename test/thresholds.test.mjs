// One health rule: the page status, the alert, the home-screen counts and the KPI tiles all read the user's thresholds (lib/thresholds.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load, req } from "./helpers.mjs";

const { deriveStatus, metricStatus, DEFAULT_THRESHOLDS } = await load("lib/thresholds.ts");
const t = await load("lib/dashboardTransforms.ts");
const settings = await load("app/api/settings/route.ts");
const has = () => true;
const page = (url, metrics) => ({ url, metrics });

test("settings: a stored file without apdexMin loads with the default 0.9; a saved value is range-checked and kept", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "mf-settings-")), "settings.json");
  process.env.METRICFLOW_SETTINGS_FILE = file;
  writeFileSync(file, JSON.stringify({ loadSeconds: 3, errorPercent: 2, uptimeSLA: 99.9 })); // written before the field existed
  assert.deepEqual(await (await settings.GET()).json(), { ...DEFAULT_THRESHOLDS, loadSeconds: 3 });
  assert.equal(DEFAULT_THRESHOLDS.apdexMin, 0.9);

  const put = (body) => settings.PUT(req("http://localhost:3000/api/settings", { method: "PUT", body }));
  for (const bad of [-0.1, 1.1, "0.8", null]) assert.equal((await put({ apdexMin: bad })).status, 400, String(bad));
  assert.equal((await put({ apdexMin: 0.8 })).status, 200);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { ...DEFAULT_THRESHOLDS, loadSeconds: 3, apdexMin: 0.8 });
  delete process.env.METRICFLOW_SETTINGS_FILE;
});

test("deriveStatus: the Apdex minimum is the user's, not a fixed 0.9", () => {
  const m = { loadTime: 900, errorRate: 0.5, apdex: 0.85 };
  assert.equal(deriveStatus(m, DEFAULT_THRESHOLDS), "Warning");
  assert.equal(deriveStatus(m, { ...DEFAULT_THRESHOLDS, apdexMin: 0.8 }), "Healthy");
  assert.equal(deriveStatus({ ...m, apdex: 0.94 }, { ...DEFAULT_THRESHOLDS, apdexMin: 0.95 }), "Warning");
});

test("breakdown counts and labels follow custom load and Apdex thresholds; a page with no value never passes", () => {
  const pages = [
    page("/a", { loadTime: 900, apdex: 0.95 }),
    page("/b", { loadTime: 1400, apdex: 0.85 }),
    page("/c", { loadTime: 2500, apdex: 0.7 }),
    page("/d", {}),
  ];
  const rows = (th) => t.computeVisibilityBreakdown(pages, [], has, th).stats.map((s) => [s.label, s.value]);
  assert.deepEqual(rows(DEFAULT_THRESHOLDS), [["Pages with Apdex 0.9 or higher", "1/4"], ["Pages Within Load Budget (1.5s)", "2/4"]]);
  assert.deepEqual(rows({ ...DEFAULT_THRESHOLDS, loadSeconds: 1, apdexMin: 0.7 }), [["Pages with Apdex 0.7 or higher", "3/4"], ["Pages Within Load Budget (1s)", "1/4"]]);
  assert.deepEqual(rows({ ...DEFAULT_THRESHOLDS, loadSeconds: 3, apdexMin: 0.85 }), [["Pages with Apdex 0.85 or higher", "2/4"], ["Pages Within Load Budget (3s)", "3/4"]]);
  // Each count agrees with the page status rule for that metric.
  for (const p of pages) assert.equal(metricStatus("loadTime", p.metrics.loadTime, DEFAULT_THRESHOLDS) === "Healthy", p.metrics.loadTime <= 1500, p.url);
});

test("KPI tiles: status and limit against the thresholds; page views has none; an unmeasured value has none", () => {
  const tiles = (metrics, th = DEFAULT_THRESHOLDS) =>
    Object.fromEntries(t.computeStats([page("/a", metrics)], [], has, th).map((c) => [c.label, [c.value, c.status, c.limit]]));

  assert.deepEqual(tiles({ loadTime: 1500, errorRate: 2, apdex: 0.9, traffic: { count: 10 } }), {
    "Avg Page Load Time": ["1.5s", "Healthy", "limit 1.5s"], // at the limit is still within it
    "Error Rate": ["2.00%", "Healthy", "limit 2%"],
    "Page views (24h)": ["10", undefined, undefined],
    "Apdex Score": ["0.90", "Healthy", "min 0.9"],
  });
  const warning = tiles({ loadTime: 1501, errorRate: 3.85, apdex: 0.89 });
  assert.deepEqual([warning["Avg Page Load Time"][1], warning["Error Rate"], warning["Apdex Score"][1]], ["Warning", ["3.85%", "Warning", "limit 2%"], "Warning"]);
  const critical = tiles({ loadTime: 3001, errorRate: 4.1, apdex: 0 });
  assert.deepEqual([critical["Avg Page Load Time"][1], critical["Error Rate"][1], critical["Apdex Score"][1]], ["Critical", "Critical", "Warning"], "Apdex has no Critical step, as in deriveStatus");
  // The same value under the user's own limits.
  assert.deepEqual(tiles({ errorRate: 3.85, apdex: 0.89, loadTime: 1501 }, { ...DEFAULT_THRESHOLDS, errorPercent: 5, apdexMin: 0.8, loadSeconds: 0.5 }), {
    "Avg Page Load Time": ["1.5s", "Critical", "limit 0.5s"],
    "Error Rate": ["3.85%", "Healthy", "limit 5%"],
    "Apdex Score": ["0.89", "Healthy", "min 0.8"],
    "Page views (24h)": ["0", undefined, undefined],
  });
  // No page measured it: the tile's 0 is not judged.
  assert.deepEqual(tiles({})["Error Rate"], ["0.00%", undefined, undefined]);
});
