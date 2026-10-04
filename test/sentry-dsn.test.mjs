import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { parseSentryDsn } = await load("lib/sentryDsn.ts");

test("SaaS DSN: project, org id, API base", () => {
  assert.deepEqual(parseSentryDsn("https://k@o123.ingest.sentry.io/456"), { ok: true, projectId: "456", orgId: "123", apiBase: "https://sentry.io/api/0" });
});
test("regional DSN keeps its region in the API host", () => {
  assert.equal(parseSentryDsn("https://k@o123.ingest.de.sentry.io/456").apiBase, "https://de.sentry.io/api/0");
  assert.equal(parseSentryDsn("https://k@o123.ingest.us.sentry.io/456").apiBase, "https://us.sentry.io/api/0");
});
test("legacy DSN: no org id", () => {
  const r = parseSentryDsn("https://k@sentry.io/456");
  assert.equal(r.orgId, null);
  assert.equal(r.apiBase, "https://sentry.io/api/0");
});
test("self-hosted DSN uses its own host", () => {
  assert.equal(parseSentryDsn("https://k@sentry.example.com/456").apiBase, "https://sentry.example.com/api/0");
});
test("invalid: missing key, missing/non-numeric project, non-URL", () => {
  for (const bad of ["https://sentry.io/456", "https://k@sentry.io/", "https://k@sentry.io/proj", "not-a-dsn"]) {
    assert.equal(parseSentryDsn(bad).ok, false, bad);
  }
});
