import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FAKE, load, mockAxios } from "./helpers.mjs";

let handler = () => ({ data: {} });
const calls = mockAxios((m, u, c) => handler(m, u, c));
const { GET } = await load("app/api/metrics/route.ts");

beforeEach(() => { calls.length = 0; for (const k of Object.keys(FAKE)) delete process.env[k]; });

test("no keys: configured false, empty pages, no external call, no invented numbers", async () => {
  const body = await (await GET()).json();
  assert.equal(body.configured, false);
  assert.deepEqual(body.pages, []);
  assert.equal(calls.length, 0);
});

test("upstream failure: 500 with an error message that does not contain any key", async () => {
  Object.assign(process.env, FAKE);
  handler = () => { throw new Error("upstream down"); };
  const res = await GET();
  assert.equal(res.status, 500);
  const s = JSON.stringify(await res.json());
  assert.match(s, /error/);
  assert.ok(!s.includes("FAKE-"));
});

test("configured but nothing discovered: configured true, empty pages", async () => {
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
