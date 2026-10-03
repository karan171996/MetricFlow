import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FAKE, httpError, load, mockAxios } from "./helpers.mjs";

const US = "https://api.newrelic.com/graphql";
const EU = "https://api.eu.newrelic.com/graphql";
const ok = { data: { data: { actor: { account: { nrql: { results: [{ n: 3 }] } } } } } };
let handler;
const calls = mockAxios((m, u) => handler(m, u));
const { nrGraphql, withRegion } = await load("lib/nrRequest.ts");

beforeEach(() => {
  calls.length = 0;
  delete process.env.NEWRELIC_REGION;
});

test("region unset, US works: one US call, region stays unset", async () => {
  handler = () => ok;
  assert.ok(await nrGraphql(FAKE.NEWRELIC_API_KEY, "{}", 1000));
  assert.deepEqual(calls.map((c) => c.url), [US]);
  assert.equal(process.env.NEWRELIC_REGION, undefined);
});

test("region unset, US rejects (401 or empty actor): falls back to EU and remembers it", async () => {
  for (const usReply of [() => { throw httpError(401); }, () => ({ data: { errors: [{}] } })]) {
    calls.length = 0;
    delete process.env.NEWRELIC_REGION;
    handler = (m, u) => (u === US ? usReply() : ok);
    assert.ok(await nrGraphql(FAKE.NEWRELIC_API_KEY, "{}", 1000));
    assert.deepEqual(calls.map((c) => c.url), [US, EU]);
    assert.equal(process.env.NEWRELIC_REGION, "eu");

    calls.length = 0;
    await nrGraphql(FAKE.NEWRELIC_API_KEY, "{}", 1000); // later calls go straight to EU
    assert.deepEqual(calls.map((c) => c.url), [EU]);
  }
});

test("region set explicitly: never falls back", async () => {
  process.env.NEWRELIC_REGION = "us";
  handler = () => { throw httpError(401); };
  await assert.rejects(nrGraphql(FAKE.NEWRELIC_API_KEY, "{}", 1000));
  assert.equal(calls.length, 1);
});

test("non-auth errors (500) do not trigger the EU retry", async () => {
  handler = () => { throw httpError(500); };
  await assert.rejects(nrGraphql(FAKE.NEWRELIC_API_KEY, "{}", 1000));
  assert.equal(calls.length, 1);
});

test("rejected in both regions: original US error is thrown, region not saved", async () => {
  handler = () => { throw httpError(401); };
  await assert.rejects(nrGraphql(FAKE.NEWRELIC_API_KEY, "{}", 1000), (e) => e.response.status === 401);
  assert.equal(calls.length, 2);
  assert.equal(process.env.NEWRELIC_REGION, undefined);
});

test("ingest host follows the same fallback", async () => {
  handler = (m, u) => {
    if (u.includes("eu01.nr-data.net")) return { data: { success: true } };
    throw httpError(403);
  };
  const axios = (await import("axios")).default;
  await withRegion((h) => axios.post(h.ingest, []));
  assert.equal(process.env.NEWRELIC_REGION, "eu");
});
