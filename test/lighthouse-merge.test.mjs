// Registry and /api/metrics with Lighthouse: New Relic keeps vitals, Lighthouse supplies lighthouse, one failure leaves the rest intact.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FAKE, load, mockAxios } from "./helpers.mjs";

mockAxios(() => { throw new Error("no network in this test"); });
const { GET } = await load("app/api/metrics/route.ts");
const { SERVER_TOOLS } = await load("lib/analytics/index.ts");
const { sourcesFor, mergeMetrics } = await load("lib/tools.ts");

const dir = mkdtempSync(join(tmpdir(), "lh-merge-"));
process.env.METRICFLOW_PROJECT_DIR = dir;
const lhr = (url, score) => ({ finalUrl: url, fetchTime: "2026-01-01T00:00:00Z", categories: { performance: { score } },
  audits: { "largest-contentful-paint": { numericValue: 1800 }, "cumulative-layout-shift": { numericValue: 0.02 }, "total-blocking-time": { numericValue: 90 } } });
writeFileSync(join(dir, "good.json"), JSON.stringify([lhr("https://prod.example/", 0.77), lhr("https://prod.example/pricing?x=1", 0.66)]));
writeFileSync(join(dir, "bad.json"), "{ not json SECRET-CONTENT");

const NR = ["NEWRELIC_API_KEY", "NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID"];
const nrPoll = async () => ({
  fresh: true, legacy: {},
  pages: [{ url: "/", views: 100 }, { url: "/only-nr", views: 5 }],
  byPath: { "/": { vitals: { lcp: 9999 }, loadTime: 1200 }, "/only-nr": { vitals: { lcp: 8888 } } },
});
const realNr = SERVER_TOOLS["new-relic"].poll;
beforeEach(() => {
  for (const k of [...Object.keys(FAKE), "LIGHTHOUSE_REPORT"]) delete process.env[k];
  SERVER_TOOLS["new-relic"].poll = nrPoll;
});
const lighthouse = (file) => { process.env.LIGHTHOUSE_REPORT = file; };
const connectNr = () => { for (const k of NR) process.env[k] = FAKE[k]; };

test("sourcesFor: vitals stay with New Relic, lighthouse is Lighthouse's, pages go to the first connected lister", () => {
  const both = sourcesFor(["new-relic", "lighthouse"]);
  assert.equal(both.vitals, "new-relic");
  assert.equal(both.pages, "new-relic");
  assert.equal(both.lighthouse, "lighthouse");
  const only = sourcesFor(["lighthouse"]);
  assert.equal(only.pages, "lighthouse");
  assert.equal(only.lighthouse, "lighthouse");
  assert.equal(only.vitals, undefined);
  assert.equal(sourcesFor(["new-relic"]).lighthouse, undefined);
});

test("mergeMetrics: a failed Lighthouse drops only lighthouse", () => {
  const by = { "new-relic": { vitals: { lcp: 1 }, loadTime: 5 }, lighthouse: { lighthouse: { score: 50 } } };
  const s = sourcesFor(["new-relic", "lighthouse"]);
  assert.deepEqual(mergeMetrics(by, s, ["lighthouse"]), { loadTime: 5, vitals: { lcp: 1 } });
  assert.deepEqual(mergeMetrics(by, s, []).lighthouse, { score: 50 });
});

test("New Relic + Lighthouse: vitals are New Relic's, lighthouse is Lighthouse's, a page with no report has no lighthouse", async () => {
  connectNr(); lighthouse("good.json");
  const body = await (await GET()).json();
  assert.deepEqual(body.failed ?? [], []);
  assert.equal(body.sources.vitals, "new-relic");
  assert.equal(body.sources.lighthouse, "lighthouse");
  const home = body.pages.find((p) => p.url === "/");
  assert.equal(home.metrics.vitals.lcp, 9999);
  assert.deepEqual(home.metrics.lighthouse, { score: 77, lcp: 1800, cls: 0.02, tbt: 90 });
  assert.equal(home.byTool.lighthouse.lighthouse.score, 77);
  assert.equal(home.byTool["new-relic"].vitals.lcp, 9999);
  const nrOnly = body.pages.find((p) => p.url === "/only-nr");
  assert.equal(nrOnly.metrics.lighthouse, undefined);
  assert.equal(nrOnly.metrics.vitals.lcp, 8888);
  assert.equal(body.pages.find((p) => p.url === "/pricing"), undefined, "pages come from New Relic, not from the report");
});

test("Lighthouse alone: pages are listed from the report, no vitals", async () => {
  lighthouse("good.json");
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.tools, ["lighthouse"]);
  assert.equal(body.sources.pages, "lighthouse");
  assert.deepEqual(body.pages.map((p) => p.url).sort(), ["/", "/pricing"]);
  const p = body.pages.find((x) => x.url === "/pricing");
  assert.equal(p.metrics.lighthouse.score, 66);
  assert.equal(p.metrics.vitals, undefined);
  assert.equal(p.status, undefined);
});

test("a failed Lighthouse load leaves New Relic's output intact and is reported as failed", async () => {
  connectNr(); lighthouse("bad.json");
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.failed, ["lighthouse"]);
  const home = body.pages.find((p) => p.url === "/");
  assert.equal(home.metrics.vitals.lcp, 9999);
  assert.equal(home.metrics.loadTime, 1200);
  assert.equal(home.metrics.lighthouse, undefined);
  assert.equal(home.byTool.lighthouse, undefined);
  assert.ok(!JSON.stringify(body).includes("SECRET-CONTENT"));
  // a missing file behaves the same
  lighthouse("missing.json");
  const again = await (await GET()).json();
  assert.deepEqual(again.failed, ["lighthouse"]);
});

test("Lighthouse alone and failing: 500 with fixed text, no spec or file content", async () => {
  lighthouse("bad.json");
  const res = await GET();
  assert.equal(res.status, 500);
  const s = JSON.stringify(await res.json());
  assert.ok(!s.includes("SECRET-CONTENT") && !s.includes("bad.json"), s);
});

test("a New Relic failure leaves Lighthouse's output intact", async () => {
  connectNr(); lighthouse("good.json");
  SERVER_TOOLS["new-relic"].poll = async () => { throw new Error("nr down"); };
  const res = await GET();
  // New Relic lists the pages here, so with it down there is nothing to list: a clean 500, not a crash
  assert.equal(res.status, 500);
  SERVER_TOOLS["new-relic"].poll = realNr;
});
