import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FAKE, load, mockAxios, req } from "./helpers.mjs";

let handler = () => ({ data: {} });
mockAxios((m, u, c) => handler(m, u, c));
const { initSnippet, SEND_SNIPPET } = await load("components/Connect/snippets.ts");
const { GET } = await load("app/api/connect/route.ts");

const NR = { accountId: "1234567", applicationId: "111111111", browserKey: "NRJS-examplebrowserkey" };
const DSN = "https://0123456789abcdef0123456789abcdef@o123.ingest.sentry.io/456";
const SECRETS = [FAKE.NEWRELIC_API_KEY, FAKE.SENTRY_API_KEY, "FAKE-INSERT"];

beforeEach(() => { for (const k of [...Object.keys(FAKE), "NEWRELIC_INSERT_KEY", "NEWRELIC_REGION"]) delete process.env[k]; });

test("snippet: one MetricFlow install line, never a vendor install line", () => {
  for (const tools of [undefined, ["new-relic"], ["sentry"], ["new-relic", "sentry"]]) {
    const s = initSnippet({ tools, ...NR, dsn: DSN }) + SEND_SNIPPET;
    assert.equal(s.match(/npm i /g).length, 1);
    assert.match(s, /npm i @karan171996\/metricflow\n/);
    assert.doesNotMatch(s, /@sentry\/browser|@newrelic\/browser-agent/);
    assert.match(s, /from '@karan171996\/metricflow\/browser'/);
  }
});

test("snippet: only the connected tools' blocks; both while tools are unknown", () => {
  const nr = initSnippet({ tools: ["new-relic"], ...NR, dsn: DSN });
  assert.match(nr, /'new-relic': \{/);
  assert.doesNotMatch(nr, /sentry: \{|dsn:/);
  const sentry = initSnippet({ tools: ["sentry"], ...NR, dsn: DSN });
  assert.match(sentry, /sentry: \{/);
  assert.doesNotMatch(sentry, /'new-relic'|browserKey/);
  const both = initSnippet({ ...NR, dsn: DSN });
  assert.match(both, /'new-relic': \{[\s\S]*sentry: \{/);
});

test("snippet: known values are filled in with no 'replace' hint; unknown ones get a shaped example and say where to find it", () => {
  const filled = initSnippet({ tools: ["new-relic", "sentry"], ...NR, dsn: DSN });
  assert.match(filled, /browserKey: 'NRJS-examplebrowserkey',\n/);
  assert.match(filled, /applicationId: '111111111',\n/);
  assert.match(filled, /accountId: '1234567',\n/);
  assert.ok(filled.includes(`dsn: '${DSN}',\n`));
  assert.doesNotMatch(filled, /replace:/);
  assert.doesNotMatch(filled, /region/);
  const empty = initSnippet({ tools: ["new-relic", "sentry"] });
  assert.match(empty, /browserKey: 'NRJS-x+', {3}\/\/ replace: .*Ingest - Browser.*NOT your NRAK-/);
  assert.match(empty, /applicationId: '\d+', {3}\/\/ replace: .*NOT your account ID/);
  assert.match(empty, /dsn: 'https:\/\/0{32}@o0\.ingest\.sentry\.io\/0', {3}\/\/ replace: Sentry > Project settings/);
});

test("snippet: region is shown only for an EU account", () => {
  assert.match(initSnippet({ tools: ["new-relic"], ...NR, region: "eu" }), /region: 'eu',\n/);
  assert.doesNotMatch(initSnippet({ tools: ["new-relic"], ...NR, region: "us" }), /region/);
});

// What the page pre-fills comes from GET /api/connect, so the secrets must not be in that body either.
const nrBody = (browserKey) => ({ data: { data: { actor: {
  account: { nrql: { results: [{ n: 0 }] } },
  entitySearch: { count: 1, results: { entities: [{ name: "mf-demo", applicationId: 653450140 }] } },
  apiAccess: { keySearch: { keys: [{ ingestType: "BROWSER", key: browserKey }] } },
} } } });
const sentry = (u) => ({ data: u.endsWith("/organizations/") ? [{ id: "123", slug: "from-token" }] : [] });
const get = async () => (await GET(req("http://localhost:3000/api/connect"))).json();

test("connect: a browser key that is not NRJS-shaped is never handed to the snippet", async () => {
  for (const [key, expected] of [["NRJS-FAKEBROWSERKEY", "NRJS-FAKEBROWSERKEY"], ["NRAK-FAKEUSERKEY0000", null], ["FAKE-LICENSE-40-CHARS", null], ["NRJS-has space", null]]) {
    Object.assign(process.env, FAKE);
    handler = (m, u) => (u.includes("newrelic") ? nrBody(key) : sentry(u));
    assert.equal((await get()).setup.browserKey, expected, key);
  }
});

test("connect: the snippet built from the response carries no secret, and says eu only for an EU account", async () => {
  Object.assign(process.env, FAKE, { NEWRELIC_INSERT_KEY: "FAKE-INSERT", SENTRY_DSN: DSN, NEWRELIC_REGION: "eu" });
  handler = (m, u) => (u.includes("newrelic") ? nrBody("NRJS-FAKEBROWSERKEY") : sentry(u));
  const body = await get();
  assert.equal(body.region, "eu");
  assert.equal(body.dsn, DSN);
  const s = initSnippet({ tools: body.tools, accountId: body.accountId, applicationId: body.setup.applicationId, browserKey: body.setup.browserKey, region: body.region, dsn: body.dsn });
  for (const secret of SECRETS) assert.ok(!s.includes(secret) && !JSON.stringify(body).includes(secret), "secret leaked");
  assert.match(s, /browserKey: 'NRJS-FAKEBROWSERKEY'/);
  assert.match(s, /region: 'eu'/);

  process.env.NEWRELIC_REGION = "us";
  assert.equal((await get()).region, undefined);
});

test("connect: a saved DSN with a secret part gives no dsn, so the snippet falls back to the example", async () => {
  Object.assign(process.env, FAKE, { SENTRY_DSN: "https://public:FAKE-DSN-SECRET@o123.ingest.sentry.io/456" });
  handler = (m, u) => (u.includes("newrelic") ? nrBody("NRJS-FAKEBROWSERKEY") : sentry(u));
  const body = await get();
  assert.equal(body.dsn, undefined);
  assert.ok(!JSON.stringify(body).includes("FAKE-DSN-SECRET"));
  assert.doesNotMatch(initSnippet({ tools: body.tools, dsn: body.dsn }), /FAKE-DSN-SECRET/);
});
