import { test } from "node:test";
import assert from "node:assert/strict";
import { load, req } from "./helpers.mjs";

const { isLocalRequest } = await load("lib/localRequest.ts");

test("localhost, 127.0.0.1 and [::1] are accepted (with and without port/origin)", () => {
  for (const host of ["localhost", "localhost:3000", "127.0.0.1:4000", "[::1]:3000"]) assert.equal(isLocalRequest(req("http://x/", { headers: { host } })), true, host);
  assert.equal(isLocalRequest(req("http://x/", { headers: { origin: "http://localhost:3000" } })), true);
});

test("DNS rebinding: foreign Host header is refused even if it resolves to 127.0.0.1", () => {
  for (const host of ["evil.example", "evil.example:3000", "localhost.evil.example", "192.168.1.84:3000", ""]) assert.equal(isLocalRequest(req("http://x/", { headers: { host } })), false, host);
});

test("foreign, malformed or 'null' Origin is refused", () => {
  for (const origin of ["http://evil.example", "not a url", "null"]) assert.equal(isLocalRequest(req("http://x/", { headers: { origin } })), false, origin);
});

test("any X-Forwarded-For (proxied request) is refused", () => {
  assert.equal(isLocalRequest(req("http://x/", { headers: { "x-forwarded-for": "1.2.3.4" } })), false);
});

// Next.js itself sets x-forwarded-for to the socket address on every request, so a loopback value must not count as "proxied".
test("x-forwarded-for with a loopback address (added by Next itself) is accepted", () => {
  for (const ip of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) assert.equal(isLocalRequest(req("http://x/", { headers: { "x-forwarded-for": ip } })), true, ip);
});

test("METRICFLOW_EXPOSED=1 disables setup/connect even for a localhost request", () => {
  const local = () => isLocalRequest(req("http://x/", { headers: { host: "localhost:3000" } }));
  assert.equal(local(), true);
  process.env.METRICFLOW_EXPOSED = "1";
  try {
    assert.equal(local(), false);
  } finally {
    delete process.env.METRICFLOW_EXPOSED;
  }
  assert.equal(local(), true);
});
