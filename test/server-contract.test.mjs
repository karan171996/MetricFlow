// C2a: the server half of the tool contract. Fake keys only, no network (axios is mocked).
// Every test captures console output and checks it with the response body: a leak in either fails.
import { test, beforeEach, afterEach } from "node:test";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { FAKE, httpError, load, mockAxios, req, tmpEnvFile } from "./helpers.mjs";

const site = "http://localhost:3001";
const nrAccount = (results = [{ pageUrl: `${site}/a`, views: 5 }]) => ({
  nrql: { results },
  views: { results: [{ pageUrl: `${site}/a`, views: 5, loadTime: { 75: 1 }, ttfb: { 75: 0.1 }, apdex: { score: 0.9 } }] },
  timing: { results: [] }, errors: { results: [] },
});
let handler;
const calls = mockAxios((m, u, c) => handler(m, u, c));
const answer = (m, u, c) => {
  if (u.includes("newrelic")) return { data: { data: { actor: { account: c.a?.query?.includes("timing:") ? nrAccount() : { nrql: nrAccount().nrql } } } } };
  return { data: u.endsWith("/organizations/") ? [{ id: "123", slug: "fake-org" }] : { data: [] } };
};
const hits = (host) => calls.filter((c) => c.url.includes(host)).length;

const { SERVER_TOOLS } = await load("lib/analytics/index.ts");
const { POLL_TTL_MS } = await load("lib/analytics/Analytics.ts");
const metrics = await load("app/api/metrics/route.ts");
const connect = await load("app/api/connect/route.ts");
const setup = await load("app/api/setup/route.ts");
const settings = await load("app/api/settings/route.ts");
const analyze = await load("app/api/analyze/route.ts");
const ai = await load("app/api/setup/ai/route.ts");
const { getHistory } = await load("lib/metricsHistory.ts");
const { parseSentryDsn, publicDsn, sentryHostNotice } = await load("lib/sentryDsn.ts");

let logged;
const real = { error: console.error, log: console.log, warn: console.warn };
let now = Date.parse("2026-01-01T10:00:00Z");
const realNow = Date.now;
beforeEach(() => {
  calls.length = 0;
  handler = answer;
  logged = [];
  for (const m of ["error", "log", "warn"]) console[m] = (...a) => logged.push(a.map((x) => (x instanceof Error ? `${x.message} ${x.stack}` : typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  for (const k of [...Object.keys(FAKE), "NEWRELIC_INSERT_KEY", "NEWRELIC_REGION"]) delete process.env[k];
  process.env.METRICFLOW_ENV_FILE = tmpEnvFile();
  now += 10 * POLL_TTL_MS; // every test starts past every memo
  Date.now = () => now;
});
afterEach(() => { Object.assign(console, real); Date.now = realNow; });

const SECRETS = () => [...Object.values(FAKE).filter((v) => v.startsWith("FAKE-")), "FAKE http error carrying"];
const clean = (text, what) => {
  for (const s of SECRETS()) assert.ok(!text.includes(s), `${what} leaked ${s}`);
};
const cleanLogs = () => clean(logged.join("\n"), "console");

test("read throws a fixed message with no cause for both tools, and logs only the tool id and status", async () => {
  Object.assign(process.env, FAKE);
  handler = () => { throw httpError(500); };
  for (const [id, label] of [["new-relic", "New Relic"], ["sentry", "Sentry"]]) {
    const err = await SERVER_TOOLS[id].read().then(() => null, (e) => e);
    assert.equal(err.message, `Could not load ${label} data.`);
    assert.equal(err.cause, undefined);
    clean(err.message + err.stack, "error");
  }
  assert.deepEqual(logged.filter((l) => /read failed/.test(l)).length, 2);
  assert.ok(logged.some((l) => l === "[tool] sentry read failed 500"));
  cleanLogs();
});

test("a failed New Relic metrics read is an error, not zeros", async () => {
  Object.assign(process.env, FAKE);
  handler = (m, u, c) => { if (c.a?.query?.includes("timing:")) throw httpError(500); return answer(m, u, c); };
  const res = await metrics.GET();
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "Could not load New Relic data." });
  cleanLogs();
});

test("route: pages supplier down is a 500 with fixed text; a Sentry failure only lists Sentry in `failed`; nothing leaks", async () => {
  Object.assign(process.env, FAKE);
  handler = (m, u) => { if (u.includes("newrelic")) throw httpError(401); return answer(m, u); };
  let res = await metrics.GET();
  assert.equal(res.status, 500);
  const text = JSON.stringify(await res.json());
  assert.equal(text, JSON.stringify({ error: "Could not load New Relic data." }));
  clean(text, "body");

  now += 10 * POLL_TTL_MS;
  handler = (m, u, c) => { if (u.includes("sentry")) throw httpError(500); return answer(m, u, c); };
  res = await metrics.GET();
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(body.failed, ["sentry"]);
  clean(JSON.stringify(body), "body");
  cleanLogs();
});

test("poll: two calls inside 25s make one vendor request; a failure is not cached; a key change misses; no snapshot on a memo hit", async () => {
  Object.assign(process.env, FAKE);
  const nr = SERVER_TOOLS["new-relic"];
  const first = await nr.poll();
  const second = await nr.poll();
  assert.equal(first.fresh, true);
  assert.equal(second.fresh, false);
  assert.equal(hits("newrelic"), 2, "one discovery + one metrics query, once");

  now += POLL_TTL_MS + 1;
  assert.equal((await nr.poll()).fresh, true, "expired");

  // History: only a fresh read adds a snapshot.
  const before = getHistory().length;
  await metrics.GET(); // memo hit for New Relic (inside 25s of the last poll)
  assert.equal(getHistory().length, before + 1, "Sentry was fresh, so one snapshot");
  await metrics.GET(); // both memoised
  assert.equal(getHistory().length, before + 1, "a memo hit records nothing");

  // Failure is not cached.
  process.env.NEWRELIC_API_KEY = "FAKE-NRAK-other"; // a key change misses the memo
  handler = () => { throw httpError(500); };
  await assert.rejects(nr.poll());
  handler = answer;
  assert.equal((await nr.poll()).fresh, true, "the failure was not kept");
  cleanLogs();
});

test("poll: the memo holds a hash, never the key, and a second caller shares the in-flight read", async () => {
  Object.assign(process.env, FAKE);
  const nr = SERVER_TOOLS["new-relic"];
  const [a, b] = await Promise.all([nr.poll(), nr.poll()]);
  assert.deepEqual([a.fresh, b.fresh].sort(), [false, true]);
  assert.equal(hits("newrelic"), 2);
  assert.ok(!JSON.stringify(Object.entries(nr)).includes("FAKE-"), "no key kept on the instance");
});

test("/api/connect returns a re-serialised DSN and none of the secrets; a legacy DSN yields none", async () => {
  Object.assign(process.env, FAKE, { NEWRELIC_INSERT_KEY: "FAKE-INSERT-0000" });
  handler = (m, u) => (u.includes("newrelic") ? { data: { data: { actor: { account: { nrql: { results: [{ n: 0 }] } } } } } } : answer(m, u));
  let body = await (await connect.GET(req("http://localhost:3000/api/connect"))).json();
  assert.equal(body.dsn, "https://public@o123.ingest.sentry.io/456");
  const text = JSON.stringify(body);
  for (const secret of [FAKE.NEWRELIC_API_KEY, FAKE.SENTRY_API_KEY, "FAKE-INSERT-0000"]) assert.ok(!text.includes(secret), secret);

  process.env.SENTRY_DSN = "https://public:FAKE-DSN-SECRET@o123.ingest.sentry.io/456";
  body = await (await connect.GET(req("http://localhost:3000/api/connect"))).json();
  assert.equal(body.dsn, undefined);
  assert.ok(!JSON.stringify(body).includes("FAKE-DSN-SECRET"));
});

test("parseSentryDsn: a password part is refused; http only for localhost; the token host is surfaced, not blocked", () => {
  const legacy = parseSentryDsn("https://public:secret@o1.ingest.sentry.io/2");
  assert.equal(legacy.ok, false);
  assert.match(legacy.error, /legacy DSN/);
  assert.ok(!legacy.error.includes("secret@"));
  assert.equal(parseSentryDsn("http://k@sentry.example.com/2").ok, false);
  for (const host of ["localhost:9000", "127.0.0.1:9000", "[::1]:9000"]) assert.equal(parseSentryDsn(`http://k@${host}/2`).ok, true, host);
  assert.equal(parseSentryDsn("https://k@sentry.example.com/2").ok, true, "self-hosted over https is allowed");
  assert.equal(sentryHostNotice("https://sentry.io/api/0"), null);
  assert.equal(sentryHostNotice("https://de.sentry.io/api/0"), null);
  assert.match(sentryHostNotice("https://sentry.example.com/api/0"), /sentry\.example\.com.*not sentry\.io/);
  assert.equal(sentryHostNotice("https://evilsentry.io/api/0") !== null, true);
  assert.equal(publicDsn("https://k@o1.ingest.sentry.io/2/"), "https://k@o1.ingest.sentry.io/2");
  assert.equal(publicDsn("https://k:s@o1.ingest.sentry.io/2"), null);
});

test("/api/setup: a self-hosted DSN is saved and the response carries a notice; a legacy DSN is refused under the field", async () => {
  handler = () => ({ data: [{ id: "9", slug: "org", organization: { slug: "org" } }] });
  const post = (body) => setup.POST(req("http://localhost:3000/api/setup", { method: "POST", body }));
  let res = await post({ SENTRY_API_KEY: FAKE.SENTRY_API_KEY, SENTRY_DSN: "https://k@sentry.example.com/9" });
  assert.equal(res.status, 200);
  assert.match((await res.json()).results.SENTRY_DSN.notice, /sentry\.example\.com/);
  const NOTICE = "Your Sentry token will be sent to sentry.example.com, which is not sentry.io. Continue only if that is your own Sentry server.";
  // A failed check has sent the token too, so it carries the same notice: host only, no token, no DSN key, no error text.
  handler = () => { throw httpError(401); };
  res = await post({ SENTRY_API_KEY: FAKE.SENTRY_API_KEY, SENTRY_DSN: "https://k@sentry.example.com/9" });
  assert.equal(res.status, 422);
  let failed = (await res.json()).results;
  assert.equal(failed.SENTRY_API_KEY.ok, false);
  assert.equal(failed.SENTRY_API_KEY.notice, NOTICE);
  handler = () => ({ data: [] }); // reachable, but no such project
  res = await post({ SENTRY_API_KEY: FAKE.SENTRY_API_KEY, SENTRY_DSN: "https://k@sentry.example.com/9" });
  failed = (await res.json()).results;
  assert.equal(failed.SENTRY_DSN.ok, false);
  assert.equal(failed.SENTRY_DSN.notice, NOTICE);
  handler = () => { throw httpError(401); };
  res = await post({ SENTRY_API_KEY: FAKE.SENTRY_API_KEY, SENTRY_DSN: FAKE.SENTRY_DSN });
  assert.equal((await res.json()).results.SENTRY_API_KEY.notice, undefined, "no notice for sentry.io");
  res = await post({ SENTRY_API_KEY: FAKE.SENTRY_API_KEY, SENTRY_DSN: "https://k:secret@o1.ingest.sentry.io/9" });
  assert.equal(res.status, 422);
  assert.match((await res.json()).results.SENTRY_DSN.error, /legacy DSN/);
});

test("a write the guard refuses is told apart from a file-system failure, and never echoes the value", async () => {
  handler = (m, u) => (u.includes("newrelic") ? answer(m, u) : { data: [{ id: "123", slug: "from-token" }] });
  process.env.SENTRY_API_KEY = "saved value with spaces"; // a saved value writeEnvLocal will refuse
  const res = await setup.POST(req("http://localhost:3000/api/setup", { method: "POST", body: { SENTRY_DSN: FAKE.SENTRY_DSN } }));
  const text = JSON.stringify(await res.json());
  assert.equal(res.status, 400);
  assert.doesNotMatch(text, /permissions/);
  assert.match(text, /refused as unsafe/);
  assert.ok(!text.includes("saved value with spaces"));

  delete process.env.SENTRY_API_KEY;
  process.env.METRICFLOW_ENV_FILE = "/nonexistent-dir-fake/.env.local";
  const fs = await setup.POST(req("http://localhost:3000/api/setup", { method: "POST", body: { SENTRY_API_KEY: FAKE.SENTRY_API_KEY, SENTRY_DSN: FAKE.SENTRY_DSN } }));
  assert.equal(fs.status, 500);
  assert.match(JSON.stringify(await fs.json()), /permissions/);
});

test("writes need Content-Type: application/json; a text/plain POST is refused before anything is written or called", async () => {
  Object.assign(process.env, FAKE);
  const plain = (url, method, body) => new Request(url, { method, headers: { host: "localhost:3000", "content-type": "text/plain" }, body: JSON.stringify(body) });
  const none = (url, method) => new Request(url, { method, headers: { host: "localhost:3000" } });
  const refused = [
    await setup.POST(plain("http://localhost:3000/api/setup", "POST", { SENTRY_API_KEY: "x", SENTRY_DSN: "y" })),
    await ai.POST(plain("http://localhost:3000/api/setup/ai", "POST", { provider: "claude", key: "FAKE-CLAUDE" })),
    await settings.PUT(plain("http://localhost:3000/api/settings", "PUT", { loadSeconds: 3 })),
    await analyze.POST(plain("http://localhost:3000/api/analyze", "POST", { metrics: {} })),
    await connect.POST(none("http://localhost:3000/api/connect", "POST")),
  ];
  for (const r of refused) assert.equal(r.status, 415);
  assert.equal(calls.length, 0);
  assert.ok(!existsSync(process.env.METRICFLOW_ENV_FILE), "nothing written");
  // application/json with a charset still passes the check
  const ok = await setup.POST(new Request("http://localhost:3000/api/setup", { method: "POST", headers: { host: "localhost:3000", "content-type": "application/json; charset=utf-8" }, body: "{}" }));
  assert.equal(ok.status, 400);
});

test("/api/analyze: a failure answers with fixed text; neither the body nor the console carries the error or a key", async () => {
  const json = (body) => new Request("http://localhost:3000/api/analyze", { method: "POST", headers: { host: "localhost:3000", "content-type": "application/json" }, body });
  // An unreadable body, and a body whose getter throws an error that carries a fake key.
  for (const request of [json("{nope"), Object.assign(json("{}"), { json: async () => { throw httpError(500); } })]) {
    const res = await analyze.POST(request);
    assert.equal(res.status, 500);
    const text = JSON.stringify(await res.json());
    assert.equal(text, JSON.stringify({ error: "Could not analyze the metrics." }));
    clean(text, "body");
  }
  assert.deepEqual(logged, ["[analyze] failed", "[analyze] failed"]);
  cleanLogs();
});

test("/api/analyze: with no AI key nothing is timed; with a key the provider call is", async () => {
  const { AI_PROVIDERS } = await load("lib/env.ts");
  const { getTimings } = await load("lib/apiTimingStore.ts");
  const aiKeys = Object.values(AI_PROVIDERS).map((p) => p.key);
  const saved = Object.fromEntries(["AI_PROVIDER", ...aiKeys].map((k) => [k, process.env[k]]));
  const post = () => analyze.POST(req("http://localhost:3000/api/analyze", { method: "POST", body: { metrics: { pages: [] } } }));
  const timed = () => getTimings().filter((t) => t.name.includes("analyze"));
  try {
    for (const k of Object.keys(saved)) delete process.env[k];
    assert.deepEqual(await (await post()).json(), { status: "unavailable", reason: "no_key" });
    assert.deepEqual(timed(), [], "no provider was called, so no timing row");

    process.env[AI_PROVIDERS.claude.key] = "FAKE-CLAUDE-0000";
    handler = () => ({ data: { content: [{ text: '{"recommendations":["cache it"]}' }] } });
    assert.equal((await (await post()).json()).status, "ok");
    assert.deepEqual(timed().map((t) => t.name), [`${AI_PROVIDERS.claude.label}: analyze`]);
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

test("the CLI empties METRICFLOW_EXPOSED on a loopback start", async () => {
  const { readFileSync } = await import("node:fs");
  const { root } = await import("./helpers.mjs");
  assert.match(readFileSync(`${root}/bin/cli.mjs`, "utf8"), /METRICFLOW_EXPOSED: loopback \? "" : "1"/);
});
