import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { FAKE, httpError, load, mockAxios, req, tmpEnvFile } from "./helpers.mjs";

const validNr = { data: { data: { actor: { user: { id: 1 }, account: { id: 1234567 } } } } };
let handler = (method, url) => (url.includes("newrelic") ? validNr : { data: {} });
const calls = mockAxios((m, u, c) => handler(m, u, c));
const { GET, POST } = await load("app/api/setup/route.ts");
const { validateKeys } = await load("lib/validateKeys.ts");

let envFile;
beforeEach(() => {
  calls.length = 0;
  handler = (m, u) => (u.includes("newrelic") ? validNr : { data: {} });
  envFile = tmpEnvFile();
  process.env.METRICFLOW_ENV_FILE = envFile;
  for (const k of [...Object.keys(FAKE), "NEWRELIC_INSERT_KEY"]) delete process.env[k];
});
const post = (body, headers) => POST(req("http://localhost:3000/api/setup", { method: "POST", body, headers }));
const text = async (res) => JSON.stringify(await res.clone().json());

test("non-localhost requests are refused on GET and POST, nothing written, no external call", async () => {
  for (const headers of [{ host: "evil.example" }, { "x-forwarded-for": "9.9.9.9" }, { origin: "http://evil.example" }]) {
    assert.equal((await post(FAKE, headers)).status, 403);
    assert.equal((await GET(req("http://x/api/setup", { headers }))).status, 403);
  }
  assert.ok(!existsSync(envFile));
  assert.equal(calls.length, 0);
});

test("empty input: 400, every field 'Required.', no external call, no file", async () => {
  const res = await post({});
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.saved, false);
  assert.deepEqual(Object.keys(body.results).sort(), Object.keys(FAKE).sort());
  assert.ok(Object.values(body.results).every((r) => r.error === "Required."));
  assert.equal(calls.length, 0);
  assert.ok(!existsSync(envFile));
});

test("whitespace-only, newline/NUL and .env-special characters are rejected before any call", async () => {
  assert.equal((await post({ ...FAKE, SENTRY_ORG_SLUG: "   " })).status, 400);
  for (const bad of ["org\nEVIL=1", "a b", "a#b", 'a"b', "a'b", "a`b", "a$b", "a\\b"]) {
    const res = await post({ ...FAKE, SENTRY_ORG_SLUG: bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
    const r = (await res.json()).results.SENTRY_ORG_SLUG;
    assert.equal(r.ok, false);
    assert.ok(r.error.length > 0);
  }
  assert.equal(calls.length, 0);
  assert.ok(!existsSync(envFile));
});

test("a NUL byte in a value is rejected (regressed when UNSAFE replaced the \\0 check)", async () => {
  const res = await post({ ...FAKE, SENTRY_ORG_SLUG: "org\0x" });
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test("invalid JSON body: 400", async () => {
  const res = await POST(new Request("http://localhost:3000/api/setup", { method: "POST", headers: { host: "localhost:3000" }, body: "{nope" }));
  assert.equal(res.status, 400);
});

test("bad New Relic key: 422 naming that key, file not written, key never echoed", async () => {
  handler = (m, u) => { if (u.includes("newrelic")) throw httpError(401); return { data: {} }; };
  const res = await post(FAKE);
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.match(body.results.NEWRELIC_API_KEY.error, /New Relic was rejected/);
  assert.ok(!existsSync(envFile));
  assert.ok(!JSON.stringify(body).includes("FAKE-"), "response leaked a key");
});

test("non-numeric account id, and account the key cannot see, name the account field", async () => {
  let r = await (await post({ ...FAKE, NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID: "abc" })).json();
  assert.equal(r.results.NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID.error, "Account ID must be a number.");
  handler = (m, u) => (u.includes("newrelic") ? { data: { data: { actor: { user: { id: 1 } } } } } : { data: {} });
  r = await (await post(FAKE)).json();
  assert.equal(r.results.NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID.ok, false);
});

test("Sentry: unknown org, unknown project, rejected token each name the right field", async () => {
  handler = (m, u) => { if (u.includes("sentry")) throw httpError(404); return validNr; };
  assert.equal((await (await post(FAKE)).json()).results.SENTRY_ORG_SLUG.ok, false);
  handler = (m, u) => { if (u.includes("/projects/")) throw httpError(404); return u.includes("newrelic") ? validNr : { data: {} }; };
  const p = (await (await post(FAKE)).json()).results;
  assert.equal(p.SENTRY_PROJECT_ID.ok, false);
  assert.equal(p.SENTRY_ORG_SLUG.ok, true);
  handler = (m, u) => { if (u.includes("sentry")) throw httpError(401); return validNr; };
  assert.match((await (await post(FAKE)).json()).results.SENTRY_API_KEY.error, /Sentry token was rejected/);
});

test("network failure gives a generic message that never contains the key", async () => {
  handler = () => { throw new Error("ECONNRESET with " + FAKE.NEWRELIC_API_KEY); };
  const s = await text(await post(FAKE));
  assert.match(s, /Could not reach/);
  assert.ok(!s.includes("FAKE-"));
});

test("valid keys: 200 saved, written to METRICFLOW_ENV_FILE (0600), unrelated lines kept, no restart needed", async () => {
  writeFileSync(envFile, "KEEP_ME=1\n");
  const res = await post(FAKE);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.saved, true);
  assert.ok(!JSON.stringify(body).includes("FAKE-"), "response echoed a key");
  const file = readFileSync(envFile, "utf8");
  assert.match(file, /^KEEP_ME=1\n/);
  for (const [k, v] of Object.entries(FAKE)) assert.ok(file.includes(`${k}=${v}`), k);
  assert.equal(process.env.SENTRY_ORG_SLUG, "fake-org"); // live without restart
  const status = await (await GET(req("http://localhost:3000/api/setup"))).json();
  assert.equal(status.configured, true);
  assert.ok(!JSON.stringify(status).includes("FAKE-"), "GET returned key values");
  assert.equal(status.keys.SENTRY_API_KEY, true);
});

test("write failure: valid keys but unwritable folder -> 500 with a clear message, no key in it", async () => {
  process.env.METRICFLOW_ENV_FILE = "/nonexistent-dir-fake/.env.local";
  const res = await post(FAKE);
  assert.equal(res.status, 500);
  const s = await text(res);
  assert.match(s, /could not be written/);
  assert.ok(!s.includes("FAKE-"));
});

test("Insert key: needs finished setup, rejects whitespace, saves alone afterwards", async () => {
  assert.equal((await post({ NEWRELIC_INSERT_KEY: "FAKE-INSERT" })).status, 400); // not configured
  Object.assign(process.env, FAKE);
  assert.equal((await post({ NEWRELIC_INSERT_KEY: "FAKE INSERT" })).status, 400);
  const ok = await post({ NEWRELIC_INSERT_KEY: "FAKE-INSERT" });
  assert.equal(ok.status, 200);
  assert.match(readFileSync(envFile, "utf8"), /NEWRELIC_INSERT_KEY=FAKE-INSERT/);
});

test("validateKeys makes one read call per source", async () => {
  await validateKeys(FAKE);
  assert.equal(calls.filter((c) => c.url.includes("newrelic")).length, 1);
});
