import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { TOOLS, TOOL_IDS, isToolId } = await load("lib/tools.ts");
const { SETUP_KEYS } = await load("lib/env.ts");

const page = (name, loadTime, errorCount, latestErrors = []) => ({
  name, slug: name, url: `/${name}`, visitors: "1", status: "Healthy", recordedAt: "",
  newRelic: { loadTime, lcp: 2000, ttfb: 100, cls: 0.1, inp: 40, fid: 5, errorRate: 1.5, throughput: 1200, apdexScore: 0.9 },
  sentry: { errorCount, errorRate: 0, warningCount: 0, latestErrors },
});

test("tools: ids, per-tool stats and cells", () => {
  assert.deepEqual(TOOL_IDS, ["new-relic", "sentry"]);
  assert.equal(isToolId("sentry"), true);
  assert.equal(isToolId("toString"), false);

  const pages = [page("home", 500, 0), page("docs", 1500, 3, [{ title: "TypeError: x", count: 3, lastSeen: "not-a-date" }])];

  assert.deepEqual(TOOLS["new-relic"].stats(pages)[0], { label: "Avg Load Time", value: "1s" });
  assert.equal(TOOLS["new-relic"].columns.find((c) => c.header === "Error Rate").cell(pages[0]), "1.50%");

  assert.deepEqual(TOOLS.sentry.stats(pages).map((s) => s.value), ["3", "1 of 2", "docs"]);
  // The last five are Sentry's own page loads and vitals: this page carries none, so each is "—", never 0.
  assert.deepEqual(TOOLS.sentry.columns.map((c) => c.cell(pages[1])), ["3", "TypeError: x", "—", "—", "—", "—", "—", "—"]);
  const traced = { ...pages[1], byTool: { sentry: { traffic: { count: 1200, sampled: true }, vitals: { lcp: 1900, cls: 0.081, ttfb: 120 } } } };
  assert.deepEqual(TOOLS.sentry.columns.map((c) => [c.header, c.cell(traced)]).slice(3), [["Page loads (sampled)", (1200).toLocaleString()], ["LCP", "1.9s"], ["TTFB", "120ms"], ["CLS", "0.08"], ["INP", "—"]]);
  assert.deepEqual(TOOLS.sentry.stats([]).map((s) => s.value), ["0", "0 of 0", "None"]);
});

test("tools: every required key is a SETUP_KEY", () => {
  for (const id of TOOL_IDS) for (const k of TOOLS[id].keys.required) assert.ok(SETUP_KEYS.includes(k), `${id}: ${k}`);
});
