// Real-key tests: read .env.local (never printed, copied or modified) and call the real New Relic / Sentry APIs.
// A missing .env.local or empty key FAILS (human rule: no fake keys, no silent skip). Add your keys to .env.local.
// Pure-logic tests elsewhere stay on fake keys.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { load, root } from "../helpers.mjs";

const REQUIRED = ["NEWRELIC_API_KEY", "NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID", "SENTRY_API_KEY", "SENTRY_DSN"];
const file = join(root, ".env.local");
if (existsSync(file)) process.loadEnvFile(file); // read-only: nothing is ever written back
const missing = !existsSync(file) ? ".env.local not found" : REQUIRED.filter((k) => !process.env[k]).length ? "a required key is empty in .env.local" : false;
const real = REQUIRED.reduce((o, k) => ({ ...o, [k]: process.env[k] }), {});
const secrets = [process.env.NEWRELIC_API_KEY, process.env.SENTRY_API_KEY, process.env.NEWRELIC_INSERT_KEY, process.env.GEMINI_API_KEY, process.env.CLAUDE_API_KEY].filter((v) => v && v.length > 8);
const leaks = (value) => secrets.some((s) => JSON.stringify(value).includes(s));
const T = { timeout: 60000 };
const needKeys = () => assert.ok(!missing, `Live tests need real keys: ${missing}. Add ${REQUIRED.join(", ")} to .env.local (see .env.local.example).`);

const metrics = missing ? null : await load("lib/newrelic.ts");
const sentry = missing ? null : await load("lib/sentry.ts");
const validate = missing ? null : await load("lib/validateKeys.ts");
const route = missing ? null : await load("app/api/metrics/route.ts");

test("real keys pass the /setup validation (one read call per source)", T, async () => {
  needKeys();
  const r = await validate.validateKeys(real);
  for (const [field, res] of Object.entries(r)) assert.equal(res.ok, true, `${field}: ${res.ok ? "" : res.error}`);
  assert.ok(!leaks(r));
});

test("a wrong New Relic key is rejected with a message that never contains a real key", T, async () => {
  needKeys();
  // Bad key derived in memory from the real one (reversed): no literal fake key exists and nothing is printed.
  const bad = [...real.NEWRELIC_API_KEY].reverse().join("");
  assert.notEqual(bad, real.NEWRELIC_API_KEY);
  const r = await validate.validateKeys({ ...real, NEWRELIC_API_KEY: bad });
  assert.equal(r.NEWRELIC_API_KEY.ok, false);
  assert.ok(!leaks(r) && !JSON.stringify(r).includes(bad));
});

test("a DSN the token cannot see is reported on that field", T, async () => {
  needKeys();
  const bad = await validate.validateKeys({ ...real, SENTRY_DSN: "https://public@o1.ingest.sentry.io/1" });
  assert.equal(bad.SENTRY_DSN.ok, false);
  assert.ok(!leaks(bad));
});

test("New Relic: discovered pages are unique, normalised, max 20; metrics are sane numbers", T, async () => {
  needKeys();
  const pages = await metrics.discoverPages(real.NEWRELIC_API_KEY, real.NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID);
  assert.ok(Array.isArray(pages) && pages.length <= 20);
  assert.equal(new Set(pages.map((p) => p.slug)).size, pages.length, "duplicate slugs");
  for (const p of pages) { assert.match(p.url, /^\//); assert.match(p.slug, /^[a-z0-9-]+$/); }
  const byPage = await metrics.getNewRelicMetrics(real.NEWRELIC_API_KEY, real.NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID);
  for (const m of Object.values(byPage)) for (const [k, v] of Object.entries(m)) assert.ok(Number.isFinite(v) && v >= 0, `${k}=${v}`);
  assert.ok(!leaks([pages, byPage]));
});

test("Sentry: errors by path have the documented shape", T, async () => {
  needKeys();
  const byPath = await sentry.getSentryErrorsByPath(real.SENTRY_API_KEY, real.SENTRY_DSN);
  for (const [path, e] of Object.entries(byPath)) {
    assert.match(path, /^\//);
    assert.ok(Number.isFinite(e.errorCount) && e.errorCount >= 0);
    assert.ok(Array.isArray(e.latestErrors));
  }
  assert.ok(!leaks(byPath));
});

test("/api/metrics with real keys: 200, configured, valid page rows, no key in the response", T, async () => {
  needKeys();
  const res = await route.GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.configured, true);
  assert.ok(Array.isArray(body.pages));
  const slugs = body.pages.map((p) => p.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const p of body.pages) {
    assert.ok(["Healthy", "Warning", "Critical"].includes(p.status), p.status);
    assert.ok(Number.isFinite(p.newRelic.loadTime) && Number.isFinite(p.sentry.errorCount));
  }
  assert.ok(!leaks(body), "response contains a real key");
});
