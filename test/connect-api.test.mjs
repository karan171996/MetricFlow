import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FAKE, httpError, load, mockAxios, req } from "./helpers.mjs";

let handler = () => ({ data: {} });
const calls = mockAxios((m, u, c) => handler(m, u, c));
const { GET, POST } = await load("app/api/connect/route.ts");

beforeEach(() => {
  calls.length = 0;
  for (const k of [...Object.keys(FAKE), "NEWRELIC_INSERT_KEY"]) delete process.env[k];
});
const get = (headers) => GET(req("http://localhost:3000/api/connect", { headers }));
const post = (headers) => POST(req("http://localhost:3000/api/connect", { method: "POST", headers, body: {} }));

test("non-localhost: 403 on GET and POST, no external call", async () => {
  Object.assign(process.env, FAKE, { NEWRELIC_INSERT_KEY: "FAKE-INSERT" });
  assert.equal((await get({ host: "evil.example" })).status, 403);
  assert.equal((await post({ "x-forwarded-for": "1.1.1.1" })).status, 403);
  assert.equal(calls.length, 0);
});

test("GET before setup: configured false, no external call", async () => {
  assert.deepEqual(await (await get()).json(), { configured: false });
  assert.equal(calls.length, 0);
});

test("GET: 'events received' per source; 'none yet' when empty; never returns key values", async () => {
  Object.assign(process.env, FAKE);
  handler = (m, u) => {
    if (u.includes("newrelic")) return { data: { data: { actor: { account: { nrql: { results: [{ n: 0 }] } } } } } };
    return { data: [] };
  };
  const body = await (await get()).json();
  assert.equal(body.configured, true);
  assert.equal(body.insertKeySet, false);
  assert.deepEqual(body.browser, { recent: 0, lastEventAt: null });
  assert.deepEqual(body.custom, { recent: 0, lastEventAt: null });
  assert.equal(body.sentry.recent, 0);
  assert.ok(!JSON.stringify(body).includes("FAKE-"));
  handler = (m, u) => (u.includes("newrelic") ? { data: { data: { actor: { account: { nrql: { results: [{ n: 3, t: Date.now() }] } } } } } } : { data: [] });
  const next = await (await get()).json();
  assert.equal(next.custom.recent, 3);
  assert.ok(next.custom.lastEventAt);
});

test("GET: unreadable source shows an error, others still report", async () => {
  Object.assign(process.env, FAKE);
  handler = (m, u) => { if (u.includes("sentry")) throw httpError(500); return { data: { data: { actor: { account: { nrql: { results: [{ n: 1, t: 1 }] } } } } } }; };
  const body = await (await get()).json();
  assert.equal(body.sentry.error, "Could not read from Sentry.");
  assert.equal(body.browser.recent, 1);
});

test("POST test event without an Insert key: 400 'Add your Insert key first.', nothing sent", async () => {
  Object.assign(process.env, FAKE);
  const res = await post();
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "Add your Insert key first.");
  assert.equal(calls.length, 0);
});

test("POST test event: sends exactly one event with the right payload; success", async () => {
  Object.assign(process.env, FAKE, { NEWRELIC_INSERT_KEY: "FAKE-INSERT" });
  handler = () => ({ data: { success: true } });
  const res = await post();
  assert.deepEqual(await res.json(), { sent: true });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /accounts\/1234567\/events$/);
  assert.deepEqual(calls[0].a, [{ eventType: "MetricFlowEvent", name: "test", value: 1, source: "connect-page" }]);
  assert.equal(calls[0].b.headers["Api-Key"], "FAKE-INSERT");
});

test("POST test event failures show the exact reason: rejected key, bad account, unreachable, not accepted", async () => {
  Object.assign(process.env, FAKE, { NEWRELIC_INSERT_KEY: "FAKE-INSERT" });
  for (const [thrown, re] of [[httpError(403), /rejected the Insert key/], [httpError(404), /account ID/], [new Error("boom"), /Could not reach/]]) {
    handler = () => { throw thrown; };
    const res = await post();
    assert.equal(res.status, 502);
    const b = await res.json();
    assert.match(b.error, re);
    assert.ok(!JSON.stringify(b).includes("FAKE-"));
  }
  handler = () => ({ data: { success: false } });
  assert.match((await (await post()).json()).error, /did not accept/);
});
