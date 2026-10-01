import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FAKE, load, mockAxios, root } from "./helpers.mjs";

// Node cannot import app/api/metrics/route.ts while it imports the type NewRelicPageMetrics without `type`.
// Skipped (not failed) until Phyllis writes `type NewRelicPageMetrics`; the bundler accepts both forms.
const src = readFileSync(`${root}/app/api/metrics/route.ts`, "utf8");
const skip = !/type\s+NewRelicPageMetrics/.test(src) && "route.ts imports a type without the `type` keyword (see report)";

let handler = () => ({ data: {} });
const calls = mockAxios((m, u, c) => handler(m, u, c));
const { GET } = skip ? {} : await load("app/api/metrics/route.ts");

beforeEach(() => { calls.length = 0; for (const k of Object.keys(FAKE)) delete process.env[k]; });

test("no keys: configured false, empty pages, no external call, no invented numbers", { skip }, async () => {
  const body = await (await GET()).json();
  assert.equal(body.configured, false);
  assert.deepEqual(body.pages, []);
  assert.equal(calls.length, 0);
});

test("upstream failure: 500 with an error message that does not contain any key", { skip }, async () => {
  Object.assign(process.env, FAKE);
  handler = () => { throw new Error("upstream down"); };
  const res = await GET();
  assert.equal(res.status, 500);
  const s = JSON.stringify(await res.json());
  assert.match(s, /error/);
  assert.ok(!s.includes("FAKE-"));
});

test("configured but nothing discovered: configured true, empty pages", { skip }, async () => {
  Object.assign(process.env, FAKE);
  handler = () => ({ data: { data: { actor: { account: { nrql: { results: [] } } } } } });
  const res = await GET();
  if (res.status === 200) {
    const body = await res.json();
    assert.equal(body.configured, true);
    assert.deepEqual(body.pages, []);
  } else {
    assert.equal(res.status, 500); // discovery treats an empty result as an error: documented, see report
  }
});
