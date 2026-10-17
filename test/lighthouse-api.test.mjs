// /api/lighthouse, saving LIGHTHOUSE_TARGET on /setup, and target mode in /api/metrics. Stub fetcher and runner: no network, no Chrome.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { FAKE, load, mockAxios, req, tmpEnvFile } from "./helpers.mjs";

const axiosCalls = mockAxios(() => { throw new Error("no network in this test"); });
const lh = await load("app/api/lighthouse/route.ts");
const setup = await load("app/api/setup/route.ts");
const metrics = await load("app/api/metrics/route.ts");
const { isToolConnected } = await load("lib/env.ts");
const { deps, resetRun, getStatus, TARGET_INVALID, TARGET_UNREACHABLE } = await load("lib/lighthouseRun.ts");

const T = "http://localhost:3001";
const lhr = (url) => ({ finalDisplayedUrl: url, categories: { performance: { score: 0.81 } }, audits: { "largest-contentful-paint": { numericValue: 1500 }, "cumulative-layout-shift": { numericValue: 0.02 }, "total-blocking-time": { numericValue: 120 } } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const idle = async () => { while (getStatus().state === "running") await sleep(1); };

let envFile, runnerCalls, release;
beforeEach(async () => {
  await idle();
  resetRun();
  axiosCalls.length = 0;
  envFile = tmpEnvFile();
  process.env.METRICFLOW_ENV_FILE = envFile;
  for (const k of [...Object.keys(FAKE), "LIGHTHOUSE_REPORT", "LIGHTHOUSE_TARGET"]) delete process.env[k];
  runnerCalls = [];
  release = null;
  deps.fetcher = async (url) => (url === `${T}/` ? { status: 200, body: '<a href="/docs">' } : url === `${T}/docs` ? { status: 200, body: "" } : { status: 404, body: "" });
  deps.runner = async (url) => { runnerCalls.push(url); return lhr(url); };
});

const LOCAL = "http://localhost:3000/api/lighthouse";

test("GET: state/done/total/lastRunAt, plus whether a target is set", async () => {
  let body = await (await lh.GET(req(LOCAL))).json();
  assert.deepEqual(body, { state: "idle", done: 0, total: 0, lastRunAt: null, target: false });
  process.env.LIGHTHOUSE_TARGET = T;
  body = await (await lh.GET(req(LOCAL))).json();
  assert.equal(body.target, true);
  assert.ok(!JSON.stringify(body).includes("3001"), "the target is never echoed");
});

test("POST starts a run (202) and reports running; the run then finishes with rows", async () => {
  process.env.LIGHTHOUSE_TARGET = T;
  deps.runner = (url) => { runnerCalls.push(url); return new Promise((r) => (release = () => r(lhr(url)))); };
  const res = await lh.POST(req(LOCAL, { method: "POST", body: {} }));
  assert.equal(res.status, 202);
  assert.equal((await res.json()).state, "running");
  while (!release) await sleep(1);
  // a second POST joins the run
  assert.equal((await lh.POST(req(LOCAL, { method: "POST", body: {} }))).status, 202);
  while (getStatus().state === "running") { if (release) { const r = release; release = null; r(); } await sleep(1); }
  assert.deepEqual(runnerCalls, [`${T}/`, `${T}/docs`]);
  const s = await (await lh.GET(req(LOCAL))).json();
  assert.equal(s.state, "idle");
  assert.equal(s.done, 2);
  assert.equal(s.total, 2);
  assert.ok(s.lastRunAt);
});

test("POST without a target: 409, no run", async () => {
  const res = await lh.POST(req(LOCAL, { method: "POST", body: {} }));
  assert.equal(res.status, 409);
  assert.equal(runnerCalls.length, 0);
});

test("both routes refuse non-local requests; POST requires JSON", async () => {
  process.env.LIGHTHOUSE_TARGET = T;
  for (const headers of [{ host: "evil.example:3000" }, { "sec-fetch-site": "cross-site" }, { "x-forwarded-for": "203.0.113.9" }, { origin: "http://evil.example" }]) {
    assert.equal((await lh.GET(req(LOCAL, { headers }))).status, 403);
    assert.equal((await lh.POST(req(LOCAL, { method: "POST", body: {}, headers }))).status, 403);
  }
  process.env.METRICFLOW_EXPOSED = "1";
  try {
    assert.equal((await lh.GET(req(LOCAL))).status, 403);
    assert.equal((await lh.POST(req(LOCAL, { method: "POST", body: {} }))).status, 403);
  } finally { delete process.env.METRICFLOW_EXPOSED; }
  const form = await lh.POST(new Request(LOCAL, { method: "POST", headers: { host: "localhost:3000", "content-type": "text/plain" }, body: "{}" }));
  assert.equal(form.status, 415);
  assert.equal(runnerCalls.length, 0);
});

const post = (body) => setup.POST(req("http://localhost:3000/api/setup", { method: "POST", body }));

test("isToolConnected('lighthouse'): either key connects it, neither does not; the others are unchanged", () => {
  assert.equal(isToolConnected("lighthouse"), false);
  process.env.LIGHTHOUSE_TARGET = T;
  assert.equal(isToolConnected("lighthouse"), true);
  delete process.env.LIGHTHOUSE_TARGET;
  process.env.LIGHTHOUSE_REPORT = "r.json";
  assert.equal(isToolConnected("lighthouse"), true);
  delete process.env.LIGHTHOUSE_REPORT;
  process.env.NEWRELIC_API_KEY = FAKE.NEWRELIC_API_KEY;
  assert.equal(isToolConnected("new-relic"), false);
  process.env.NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID = FAKE.NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID;
  assert.equal(isToolConnected("new-relic"), true);
  assert.equal(isToolConnected("sentry"), false);
});

test("setup: the target alone is checked, saved, connects Lighthouse, and starts a run the save does not wait for", async () => {
  deps.runner = (url) => { runnerCalls.push(url); return new Promise((r) => (release = () => r(lhr(url)))); };
  const res = await post({ LIGHTHOUSE_TARGET: T });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { saved: true, results: { LIGHTHOUSE_TARGET: { ok: true } } });
  assert.match(readFileSync(envFile, "utf8"), /^LIGHTHOUSE_TARGET=http:\/\/localhost:3001$/m);
  assert.equal(getStatus().state, "running", "the save returned while the run is still going");
  const status = await (await setup.GET(req("http://localhost:3000/api/setup"))).json();
  assert.deepEqual(status.tools, ["lighthouse"]);
  assert.strictEqual(status.keys.LIGHTHOUSE_TARGET, true);
  while (getStatus().state === "running") { if (release) { const r = release; release = null; r(); } await sleep(1); }
  assert.equal(axiosCalls.length, 0);
});

test("setup: target alongside a report, in one request; both checked and saved", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "lh-api-"));
  writeFileSync(join(dir, "r.json"), JSON.stringify(lhr("https://prod.example/")));
  process.env.METRICFLOW_PROJECT_DIR = dir;
  const res = await post({ LIGHTHOUSE_TARGET: T, LIGHTHOUSE_REPORT: "r.json" });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).results, { LIGHTHOUSE_REPORT: { ok: true }, LIGHTHOUSE_TARGET: { ok: true } });
  const saved = readFileSync(envFile, "utf8");
  assert.match(saved, /^LIGHTHOUSE_TARGET=/m);
  assert.match(saved, /^LIGHTHOUSE_REPORT=r\.json$/m);
  await idle();
  delete process.env.METRICFLOW_PROJECT_DIR;
});

test("setup: a bad or silent target is rejected with fixed text that never contains the value; nothing saved, no run", async () => {
  const cases = [
    ["ftp://localhost:3001/SECRETPATH", TARGET_INVALID],
    ["http://admin:SECRETPW@localhost:3001", TARGET_INVALID],
    ["localhost:3001", TARGET_INVALID],
    ["http://localhost:3999/SECRETPATH", TARGET_UNREACHABLE],
  ];
  for (const [value, error] of cases) {
    const res = await post({ LIGHTHOUSE_TARGET: value });
    assert.equal(res.status, 422, value);
    const body = await res.json();
    assert.deepEqual(body.results, { LIGHTHOUSE_TARGET: { ok: false, error } });
    const s = JSON.stringify(body);
    for (const leak of ["SECRET", "3001", "3999", "admin", "ftp"]) assert.ok(!s.includes(leak), `${value} leaked ${leak}`);
  }
  // a fetcher that times out (what the 10s AbortSignal does) is "did not answer"
  deps.fetcher = async () => { throw Object.assign(new Error("aborted due to timeout"), { name: "TimeoutError" }); };
  const res = await post({ LIGHTHOUSE_TARGET: T });
  assert.equal((await res.json()).results.LIGHTHOUSE_TARGET.error, TARGET_UNREACHABLE);
  assert.ok(!existsSync(envFile));
  assert.equal(process.env.LIGHTHOUSE_TARGET, undefined);
  assert.equal(runnerCalls.length, 0);
});

test("metrics in target mode: empty (not failed) before the first run, the store's rows after it", async () => {
  process.env.LIGHTHOUSE_TARGET = T;
  process.env.LIGHTHOUSE_REPORT = "ignored-when-target-is-set.json";
  deps.runner = (url) => { runnerCalls.push(url); return new Promise((r) => (release = () => r(lhr(url)))); };
  const first = await metrics.GET();
  assert.equal(first.status, 200);
  let body = await first.json();
  assert.deepEqual(body.tools, ["lighthouse"]);
  assert.equal(body.error, undefined, "an unfinished first run is empty, not a failed load");
  assert.deepEqual(body.pages, []);
  assert.equal(getStatus().state, "running", "the first poll started a run (never run before)");
  while (getStatus().state === "running") { if (release) { const r = release; release = null; r(); } await sleep(1); }
  body = await (await metrics.GET()).json();
  assert.deepEqual(body.pages.map((p) => p.url).sort(), ["/", "/docs"]);
  const home = body.pages.find((p) => p.url === "/");
  assert.deepEqual(home.byTool.lighthouse, { lighthouse: { score: 81, lcp: 1500, cls: 0.02, tbt: 120 } });
  assert.deepEqual(home.metrics.lighthouse, { score: 81, lcp: 1500, cls: 0.02, tbt: 120 });
  assert.ok(body.history.length >= 1, "the finished run was a fresh read and added a snapshot");
  assert.equal(runnerCalls.length, 2, "a fresh run is not started again on the next poll");
});
