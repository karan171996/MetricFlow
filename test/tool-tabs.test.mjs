import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { FAKE, httpError, load, mockAxios, req, tmpEnvFile } from "./helpers.mjs";

const NR = { NEWRELIC_API_KEY: FAKE.NEWRELIC_API_KEY, NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID: FAKE.NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID };
const SENTRY = { SENTRY_API_KEY: FAKE.SENTRY_API_KEY, SENTRY_DSN: FAKE.SENTRY_DSN };

const validNr = { data: { data: { actor: { user: { id: 1 }, account: { id: 1234567 } } } } };
const nrAccount = { data: { data: { actor: { account: {
  nrql: { results: [{ pageUrl: "https://x.com/a", views: 5 }] },
  views: { results: [{ pageUrl: "https://x.com/a", views: 5, loadTime: 1, ttfb: 0.1, apdex: { score: 0.9 } }] },
  timing: { results: [] }, errors: { results: [] },
} } } } };
let handler;
const calls = mockAxios((m, u, c) => handler(m, u, c));
const hits = (host) => calls.filter((c) => c.url.includes(host)).length;

const env = await load("lib/env.ts");
const setup = await load("app/api/setup/route.ts");
const connect = await load("app/api/connect/route.ts");
const metrics = await load("app/api/metrics/route.ts");
const { TOOLS } = await load("lib/tools.ts");

let envFile;
beforeEach(() => {
  calls.length = 0;
  handler = (m, u) => (u.includes("newrelic") ? validNr : { data: [{ id: "123", slug: "from-token" }] });
  envFile = tmpEnvFile();
  process.env.METRICFLOW_ENV_FILE = envFile;
  for (const k of [...Object.keys(FAKE), "NEWRELIC_INSERT_KEY", "NEWRELIC_REGION"]) delete process.env[k];
});
const post = (body) => setup.POST(req("http://localhost:3000/api/setup", { method: "POST", body }));

test("tools: every required key belongs to SETUP_KEYS", () => {
  for (const t of Object.values(TOOLS)) for (const k of t.keys.required) assert.ok(env.SETUP_KEYS.includes(k), k);
});

test("connected = all of a tool's keys; half a tool is not connected; isConfigured = any tool", () => {
  assert.deepEqual(env.connectedTools(), []);
  assert.equal(env.isConfigured(), false);
  process.env.NEWRELIC_API_KEY = "x";
  assert.deepEqual(env.connectedTools(), []);
  Object.assign(process.env, NR);
  assert.deepEqual(env.connectedTools(), ["new-relic"]);
  assert.equal(env.isConfigured(), true);
  Object.assign(process.env, SENTRY);
  assert.deepEqual(env.connectedTools(), ["new-relic", "sentry"]);
  for (const k of Object.keys(NR)) delete process.env[k];
  assert.deepEqual(env.connectedTools(), ["sentry"]);
});

test("setup: New Relic only saves, validates and writes only New Relic; Sentry is never called", async () => {
  const res = await post(NR);
  assert.equal(res.status, 200);
  assert.equal(hits("sentry"), 0);
  const file = readFileSync(envFile, "utf8");
  assert.match(file, /NEWRELIC_API_KEY=/);
  assert.ok(!file.includes("SENTRY"));
  assert.deepEqual((await (await setup.GET(req("http://localhost:3000/api/setup"))).json()).tools, ["new-relic"]);
});

test("setup: Sentry only saves and leaves New Relic region untouched", async () => {
  process.env.NEWRELIC_REGION = "eu";
  const res = await post(SENTRY);
  assert.equal(res.status, 200);
  assert.equal(hits("newrelic"), 0);
  assert.ok(!readFileSync(envFile, "utf8").includes("NEWRELIC_REGION"));
  assert.equal(process.env.NEWRELIC_REGION, "eu");
});

test("setup: half-filled group is rejected on the missing field, nothing saved, no call", async () => {
  const res = await post({ NEWRELIC_API_KEY: "x" });
  assert.equal(res.status, 400);
  const r = (await res.json()).results.NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID;
  assert.match(r.error, /Add the New Relic account ID, or clear the New Relic User API key to skip New Relic\./);
  assert.equal(calls.length, 0);
  assert.ok(!existsSync(envFile));
});

test("setup: a saved key fills the other half of a group (replace one field)", async () => {
  Object.assign(process.env, NR);
  const res = await post({ NEWRELIC_API_KEY: "FAKE-NEW" });
  assert.equal(res.status, 200);
  assert.match(readFileSync(envFile, "utf8"), /NEWRELIC_API_KEY=FAKE-NEW/);
});

test("setup: a complete group beside a half-filled one is still rejected", async () => {
  assert.equal((await post({ ...NR, SENTRY_API_KEY: "x" })).status, 400);
  assert.ok(!existsSync(envFile));
});

test("setup: Insert key needs New Relic; a Sentry-only user is refused it", async () => {
  Object.assign(process.env, SENTRY);
  assert.equal((await post({ NEWRELIC_INSERT_KEY: "FAKE-INSERT" })).status, 400);
  Object.assign(process.env, NR);
  assert.equal((await post({ NEWRELIC_INSERT_KEY: "FAKE-INSERT" })).status, 200);
});

test("connect: New Relic only makes no Sentry call and reports tools", async () => {
  Object.assign(process.env, NR);
  const body = await (await connect.GET(req("http://localhost:3000/api/connect"))).json();
  assert.deepEqual(body.tools, ["new-relic"]);
  assert.equal(hits("sentry"), 0);
  assert.equal(body.sentry, undefined);
});

test("connect: Sentry only makes no New Relic call", async () => {
  Object.assign(process.env, SENTRY);
  const body = await (await connect.GET(req("http://localhost:3000/api/connect"))).json();
  assert.deepEqual(body.tools, ["sentry"]);
  assert.equal(hits("newrelic"), 0);
});

test("metrics: New Relic only makes no Sentry call; pages carry no sentry field", async () => {
  Object.assign(process.env, NR);
  handler = () => nrAccount;
  const body = await (await metrics.GET()).json();
  assert.deepEqual(body.tools, ["new-relic"]);
  assert.equal(body.pages.length, 1);
  assert.equal(body.pages[0].sentry, undefined);
  assert.equal(hits("sentry"), 0);
});

test("metrics: both tools - Sentry is called; if it fails, New Relic data stays and `failed` names Sentry", async () => {
  Object.assign(process.env, FAKE);
  handler = (m, u) => { if (u.includes("sentry")) throw httpError(500); return nrAccount; };
  const body = await (await metrics.GET()).json();
  assert.deepEqual(body.failed, ["sentry"]);
  assert.equal(body.pages.length, 1);
  assert.equal(body.pages[0].sentry, undefined);
  assert.ok(hits("sentry") > 0);
});

test("metrics: Sentry only never calls New Relic; Sentry lists the pages, and with nothing sent yet there are none", async () => {
  Object.assign(process.env, SENTRY);
  const body = await (await metrics.GET()).json();
  assert.deepEqual(body.tools, ["sentry"]);
  assert.equal(body.sources.pages, "sentry");
  assert.equal(body.error, undefined);
  assert.deepEqual(body.pages, []);
  assert.equal(hits("newrelic"), 0);
  assert.ok(hits("sentry") > 0, "Sentry is read");
});

test("analysis: no error-count alert unless a page carries Sentry data", async () => {
  const { analyzeMetrics } = await load("lib/aiAnalysis.ts");
  const ai = { provider: "claude", key: "FAKE-CLAUDE-0000" };
  const reply = { alerts: [{ severity: "high", page: "/", message: "slow", metric: "loadTime" }, { severity: "low", page: "/", message: "errors", metric: "errorCount" }] };
  handler = () => ({ data: { content: [{ text: JSON.stringify(reply) }] } });
  const metrics = (r) => r.alerts.map((a) => a.metric);
  const nrOnly = await analyzeMetrics({ pages: [{ newRelic: {} }] }, ai);
  assert.equal(nrOnly.status, "ok");
  assert.deepEqual(metrics(nrOnly), ["loadTime"]);
  assert.deepEqual(metrics(await analyzeMetrics({ pages: [{ newRelic: {}, sentry: { errorCount: 1 } }] }, ai)), ["loadTime", "errorCount"]);
});

test("analysis: no key, a provider failure or an unusable reply is `unavailable` with a fixed reason - never invented alerts", async () => {
  const { analyzeMetrics } = await load("lib/aiAnalysis.ts");
  const ai = { provider: "claude", key: "FAKE-CLAUDE-0000" };
  const pages = { pages: [{ newRelic: {} }] };
  const says = (text) => () => ({ data: { content: [{ text }] } });
  const error = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await analyzeMetrics(pages, null), { status: "unavailable", reason: "no_key" });
    assert.equal(calls.length, 0, "no key, no call");
    handler = () => { throw httpError(500); };
    assert.deepEqual(await analyzeMetrics(pages, ai), { status: "unavailable", reason: "provider_error" });
    for (const text of ["Sorry, I cannot help.", "{not json}", "{}", '{"analysis":"fine"}', '{"alerts":"none"}', '{"status":"ok"}', '{"alerts":"none","recommendations":["x"]}', '{"alerts":"none","recommendations":[]}']) {
      handler = says(text);
      assert.deepEqual(await analyzeMetrics(pages, ai), { status: "unavailable", reason: "bad_response" }, text);
    }
    // A reply cannot set its own status.
    handler = says('{"status":"unavailable","recommendations":["cache it"]}');
    assert.deepEqual(await analyzeMetrics(pages, ai), { status: "ok", recommendations: ["cache it"] });
  } finally {
    console.error = error;
  }
});
