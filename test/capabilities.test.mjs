import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { TOOLS, TOOL_IDS, CAPABILITIES, KEY_FIELDS, KEY_LABELS, sourcesFor, mergeMetrics, toolColumns } = await load("lib/tools.ts");
const { deriveStatus, DEFAULT_THRESHOLDS } = await load("lib/thresholds.ts");

test("tools: each entry declares today's capabilities, and every column names one of them", () => {
  assert.deepEqual(TOOLS["new-relic"].capabilities, ["pages", "traffic", "loadTime", "apdex", "vitals", "ajax", "errorRate"]);
  assert.deepEqual(TOOLS.sentry.capabilities, ["errors"]);
  for (const id of TOOL_IDS) {
    for (const cap of TOOLS[id].capabilities) assert.ok(CAPABILITIES.includes(cap), `${id}: ${cap}`);
    assert.deepEqual(toolColumns(id), TOOLS[id].columns, `${id}: no column is hidden today`);
    for (const k of TOOLS[id].keys.required) assert.equal(KEY_LABELS[k], KEY_FIELDS[k].label, k);
  }
});

test("sourcesFor: first connected tool in TOOLS order that declares the capability", () => {
  const nr = Object.fromEntries(TOOLS["new-relic"].capabilities.map((c) => [c, "new-relic"]));
  assert.deepEqual(sourcesFor(["new-relic", "sentry"]), { ...nr, errors: "sentry" });
  assert.deepEqual(sourcesFor(["sentry", "new-relic"]), { ...nr, errors: "sentry" }, "the order of the argument does not matter");
  assert.deepEqual(sourcesFor(["new-relic"]), nr);
  assert.deepEqual(sourcesFor(["sentry"]), { errors: "sentry" });
  assert.deepEqual(sourcesFor([]), {});
});

test("mergeMetrics: whole capabilities from their supplier only; a failed supplier leaves a gap", () => {
  const errors = { count: 2, latest: [] };
  const byTool = { "new-relic": { loadTime: 900, apdex: 0.9 }, sentry: { errors, loadTime: 5 } };
  const sources = { loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", errors: "sentry" };

  assert.deepEqual(mergeMetrics(byTool, sources, []), { loadTime: 900, apdex: 0.9, errors }, "Sentry's loadTime is ignored: it is not the supplier");
  assert.deepEqual(mergeMetrics(byTool, sources, ["sentry"]), { loadTime: 900, apdex: 0.9 });
  assert.deepEqual(mergeMetrics(byTool, sources, ["new-relic"]), { errors }, "the next tool is never promoted");
  assert.deepEqual(mergeMetrics({ sentry: { errors, loadTime: 5 } }, sources, []), { errors }, "no row from the supplier = absent, not borrowed");
  assert.deepEqual(mergeMetrics(byTool, {}, []), {});
});

test("deriveStatus: no status unless load time, error rate and Apdex are all there; otherwise the same rule as before", () => {
  const t = DEFAULT_THRESHOLDS; // 1.5s, 2%
  const m = { loadTime: 1000, errorRate: 1, apdex: 0.95 };
  for (const k of Object.keys(m)) assert.equal(deriveStatus({ ...m, [k]: undefined }, t), undefined, `${k} missing`);
  assert.equal(deriveStatus({ errors: { count: 9, latest: [] } }, t), undefined);

  assert.equal(deriveStatus(m, t), "Healthy");
  assert.equal(deriveStatus({ ...m, apdex: 0.89 }, t), "Warning");
  assert.equal(deriveStatus({ ...m, loadTime: 1501 }, t), "Warning");
  assert.equal(deriveStatus({ ...m, errorRate: 2.1 }, t), "Warning");
  assert.equal(deriveStatus({ ...m, loadTime: 3001 }, t), "Critical");
  assert.equal(deriveStatus({ ...m, errorRate: 4.1 }, t), "Critical");
  assert.equal(deriveStatus({ loadTime: 0, errorRate: 0, apdex: 0 }, t), "Warning", "the legacy zeros of a page with no rows still read as Warning in C1");
});
