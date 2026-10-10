// One health rule: the page status, the alert, the home-screen counts and the KPI tiles all read the user's thresholds (lib/thresholds.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load, req } from "./helpers.mjs";

const { deriveStatus, metricStatus, overageRatio, rankPages, breachReasons, hasPerformance, DEFAULT_THRESHOLDS } = await load("lib/thresholds.ts");
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

// ── The "Fix first" order (rankPages), its reasons (breachReasons) and the one ratio behind both ──
const D = DEFAULT_THRESHOLDS;
const thresholdsLib = await load("lib/thresholds.ts");
/** A page that has data unless told otherwise: a healthy New Relic row. `m` overrides or removes (undefined) a value. */
const row = (slug, m = {}, name = slug) => ({ slug, name, url: `/${slug}`, visitors: "", metrics: { loadTime: 900, errorRate: 0.5, apdex: 0.95, ...m } });
const order = (pages, th = D) => rankPages(pages, th).map((p) => p.slug);

test("overageRatio: one formula per metric; NaN is 0, a zero limit is Infinity; metricStatus reads the same number", () => {
  assert.equal(overageRatio("loadTime", 3000, D), 2);
  assert.equal(overageRatio("errorRate", 3, D), 1.5);
  assert.equal(overageRatio("apdex", 0.45, D), 2); // the other way round: minimum / value
  assert.equal(overageRatio("loadTime", NaN, D), 0);
  assert.equal(overageRatio("apdex", 0, { ...D, apdexMin: 0 }), 0, "0/0");
  assert.equal(overageRatio("loadTime", 0, { ...D, loadSeconds: 0 }), 0, "0/0");
  assert.equal(overageRatio("loadTime", 1, { ...D, loadSeconds: 0 }), Infinity);
  assert.equal(overageRatio("errorRate", Infinity, D), Infinity);
  assert.equal(overageRatio("apdex", 0, D), Infinity);

  // Warning above 1, Critical above 2, and exactly at either step is still the lower status.
  assert.deepEqual([1500, 1501, 3000, 3001].map((v) => metricStatus("loadTime", v, D)), ["Healthy", "Warning", "Warning", "Critical"]);
  assert.deepEqual([2, 2.01, 4, 4.01].map((v) => metricStatus("errorRate", v, D)), ["Healthy", "Warning", "Warning", "Critical"]);
  assert.deepEqual([0.9, 0.89, 0.1, 0].map((v) => metricStatus("apdex", v, D)), ["Healthy", "Warning", "Warning", "Warning"], "Apdex has no Critical step");
  assert.equal(metricStatus("loadTime", NaN, D), "Healthy", "NaN is not over a limit");
  assert.equal(metricStatus("loadTime", 1, { ...D, loadSeconds: 0 }), "Critical", "anything is over a zero limit");
  assert.equal(metricStatus("errorRate", 0, { ...D, errorPercent: 0 }), "Healthy", "0 against a zero limit is not over it");
  assert.equal(metricStatus("apdex", undefined, D), undefined);
});

test("rankPages: Critical, Warning, errors without a status, Healthy, nothing to judge, no data; each page gets its derived status", () => {
  const pages = [
    { ...row("no-data", { loadTime: undefined, errorRate: undefined, apdex: undefined }), status: "Healthy" }, // the status sent is ignored
    row("quiet", { loadTime: undefined, traffic: { count: 9 } }),                       // data, no status, no errors
    row("healthy"),
    row("errors-only", { loadTime: undefined, errorRate: undefined, apdex: undefined, errors: { count: 3, latest: [] } }),
    row("warning", { loadTime: 2000 }),
    row("critical", { errorRate: 4.5 }),
  ];
  const ranked = rankPages(pages, D);
  assert.deepEqual(ranked.map((p) => [p.slug, p.status]), [
    ["critical", "Critical"], ["warning", "Warning"], ["errors-only", undefined], ["healthy", "Healthy"], ["quiet", undefined], ["no-data", undefined],
  ]);
  assert.equal(pages[0].status, "Healthy", "the input is not changed");
  assert.deepEqual(order([...pages].reverse()), ranked.map((p) => p.slug), "the input order does not matter");
  // Changing a limit reorders: at a 0.5s limit the 0.9s pages are Warning and the 2s page is Critical.
  assert.deepEqual(order(pages, { ...D, loadSeconds: 0.5 }).slice(0, 3), ["warning", "critical", "healthy"]);
});

test("rankPages tie-breaks, in order: worst ratio, Sentry errors, traffic, name, slug", () => {
  // Ratio: the worst of the three metrics counts, and Apdex counts as minimum / value.
  assert.deepEqual(order([row("a", { loadTime: 3300 }), row("b", { errorRate: 9 }), row("c", { loadTime: 3100, errorRate: 5 })]), ["b", "c", "a"]);
  assert.deepEqual(order([row("load", { loadTime: 1800 }), row("apdex", { apdex: 0.6 })]), ["apdex", "load"], "0.9/0.6 = 1.5 beats 1.8/1.5 = 1.2");
  // All healthy: closest to a limit first.
  assert.deepEqual(order([row("far", { loadTime: 300, apdex: 1 }), row("near", { loadTime: 1400, apdex: 1 })]), ["near", "far"]);
  // Equal ratio -> more Sentry errors first; a missing count is 0.
  const same = { loadTime: 3300 };
  assert.deepEqual(order([row("a", same), row("b", { ...same, errors: { count: 2, latest: [] } }), row("c", { ...same, errors: { count: 7, latest: [] } })]), ["c", "b", "a"]);
  // Equal errors -> more traffic first; missing traffic is 0.
  assert.deepEqual(order([row("a", same), row("b", { ...same, traffic: { count: 10 } }), row("c", { ...same, traffic: { count: 500 } })]), ["c", "b", "a"]);
  // Equal traffic -> name, then slug.
  assert.deepEqual(order([row("z", same, "Alpha"), row("y", same, "beta"), row("x", same, "Alpha")]), ["x", "z", "y"]);
});

test("rankPages: Sentry-only pages are ordered by errors; a zero limit and NaN/Infinity values do not break the order", () => {
  const sentry = (slug, errors, traffic) => ({ slug, name: slug, url: `/${slug}`, visitors: "", metrics: { ...(errors !== undefined && { errors: { count: errors, latest: [] } }), ...(traffic && { traffic: { count: traffic, sampled: true } }) } });
  const ranked = rankPages([sentry("none", 0, 5), sentry("few", 2), sentry("many", 40), sentry("silent", 0), sentry("busy", 0, 90)], D);
  assert.deepEqual(ranked.map((p) => p.slug), ["many", "few", "busy", "none", "silent"]);
  assert.ok(ranked.every((p) => p.status === undefined), "no status without New Relic's three values");

  // Zero limit: every page with a load time is infinitely over it. Equal (Infinity) ratios fall through to errors, then name.
  const zero = { ...D, loadSeconds: 0 };
  assert.deepEqual(rankPages([row("b"), row("a"), row("c", { errors: { count: 1, latest: [] } })], zero).map((p) => [p.slug, p.status]), [["c", "Critical"], ["a", "Critical"], ["b", "Critical"]]);
  // Infinity sorts first; NaN is 0, so it is neither over a limit nor ahead of a real value.
  assert.deepEqual(order([row("finite", { loadTime: 9000 }), row("inf", { loadTime: Infinity })]), ["inf", "finite"]);
  assert.deepEqual(rankPages([row("nan", { errorRate: NaN, loadTime: 300, apdex: 1 }), row("ok", { loadTime: 1400, apdex: 1 })], D).map((p) => [p.slug, p.status]), [["ok", "Healthy"], ["nan", "Healthy"]]);
  assert.deepEqual(order([row("nan-traffic", { traffic: { count: NaN } }), row("real", { traffic: { count: 1 } })]), ["real", "nan-traffic"]);
  assert.deepEqual(rankPages([], D), []);
});

test("breachReasons: every metric over its limit, worst first, with the value and the user's limit; nothing when within limits", () => {
  assert.deepEqual(breachReasons(row("a"), D), []);
  assert.deepEqual(breachReasons(row("a", { loadTime: 1500, errorRate: 2, apdex: 0.9 }), D), [], "at the limit is within it");
  assert.deepEqual(breachReasons(row("a", { loadTime: 3100 }), D), ["load time 3.1s (limit 1.5s)"]);
  // 4.2/2 = 2.1 is ahead of 3100/1500 = 2.07 and of 0.9/0.85.
  assert.deepEqual(breachReasons(row("a", { loadTime: 3100, errorRate: 4.2, apdex: 0.85 }), D), ["error rate 4.20% (limit 2%)", "load time 3.1s (limit 1.5s)", "Apdex 0.85 (min 0.9)"]);
  // The user's own limits, and a page with only some of the values (no status, but the reason is still true).
  assert.deepEqual(breachReasons(row("a", { loadTime: 900, errorRate: undefined, apdex: undefined }), { ...D, loadSeconds: 0.5 }), ["load time 900ms (limit 0.5s)"]);
  // Zero limits: both are infinitely over, so they keep the fixed order load time, error rate.
  assert.deepEqual(breachReasons(row("a"), { ...D, loadSeconds: 0, errorPercent: 0 }), ["load time 900ms (limit 0s)", "error rate 0.50% (limit 0%)"]);
  assert.deepEqual(breachReasons(row("a", { loadTime: NaN, errorRate: Infinity, traffic: { count: 1 } }), D), ["error rate Infinity% (limit 2%)"]);
  assert.deepEqual(breachReasons({ metrics: {} }, D), []);
});

test("table summary and breakdown card cannot contradict each other: both read metricStatus", () => {
  const pages = [row("fast", { loadTime: 1200 }), row("slow", { loadTime: 2000 }), row("erroring", { errorRate: 3 })];
  const over = rankPages(pages, D).filter((p) => p.status !== "Healthy").map((p) => p.slug);
  assert.deepEqual(over, ["erroring", "slow"]);
  const counts = t.computeVisibilityBreakdown(pages, [], has, D).stats.map((s) => s.value);
  // The page over only its error-rate limit is in the summary's count and still passes both breakdown counts.
  assert.deepEqual(counts, ["3/3", "2/3"]);
});

test("a page New Relic has no row for arrives as zeros: it is not judged, gives no reason, and ranks between Warning and Healthy", () => {
  // What /api/metrics sends for a page listed only for its Sentry errors (the route's emptyPage).
  const zeros = { slug: "zeros", name: "zeros", url: "/zeros", visitors: "0", status: "Warning", metrics: { loadTime: 0, errorRate: 0, apdex: 0, traffic: { count: 0 }, errors: { count: 3, latest: [] } } };
  assert.equal(hasPerformance(zeros), false);
  assert.equal(hasPerformance(row("a")), true);
  assert.equal(hasPerformance({ metrics: { traffic: { count: 1 }, loadTime: 0 } }), true, "a view is enough");
  assert.deepEqual(breachReasons(zeros, D), [], "Apdex 0.00 is not a measurement");

  const ranked = rankPages([row("healthy"), zeros, row("warning", { loadTime: 2000 }), row("critical", { errorRate: 4.5 })], D);
  assert.deepEqual(ranked.map((p) => [p.slug, p.status]), [["critical", "Critical"], ["warning", "Warning"], ["zeros", undefined], ["healthy", "Healthy"]]);
  // The table's status word for a page with data and no status (components/PerformanceHub/HubTable.tsx).
  const { hasData } = thresholdsLib;
  assert.equal(ranked[2].status ?? (hasData(ranked[2]) ? "No performance data" : "No data yet"), "No performance data");
  // The same zeros with no errors is a page with no data at all: last.
  assert.deepEqual(order([{ ...zeros, slug: "empty", metrics: { ...zeros.metrics, errors: { count: 0, latest: [] } } }, zeros, row("healthy")]), ["zeros", "healthy", "empty"]);
  assert.equal(metricStatus("apdex", -0.1, D), "Warning", "a negative Apdex is under the minimum, as before");
});
