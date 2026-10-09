// Sentry as a supplier of pages, sampled traffic and web vitals (from tracing), beside its errors.
// The page-load query and its field names were checked against a real spans-billed project; the rows here have that shape.
import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { FAKE, httpError, load, mockAxios } from "./helpers.mjs";

const NR = { NEWRELIC_API_KEY: FAKE.NEWRELIC_API_KEY, NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID: FAKE.NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID };
const SENTRY = { SENTRY_API_KEY: FAKE.SENTRY_API_KEY, SENTRY_DSN: FAKE.SENTRY_DSN };
const site = "http://localhost:3001";
const span = (url, count, lcp, cls, ttfb, inp = null) => ({ transaction: new URL(url).pathname, "url.full": url, "count_sample()": count, "p75(measurements.lcp)": lcp, "p75(measurements.cls)": cls, "p75(measurements.inp)": inp, "p75(measurements.ttfb)": ttfb });

let spans, errors, sentryDown;
const calls = mockAxios((method, url, call) => {
  if (url.includes("newrelic")) {
    const discovered = [{ pageUrl: `${site}/a`, views: 500 }];
    const account = { views: { results: [{ pageUrl: `${site}/a`, views: 500, loadTime: { 75: 1 }, ttfb: { 75: 0.1 }, apdex: { score: 0.95 } }] }, timing: { results: [{ pageUrl: `${site}/a`, lcp: { 75: 2 }, cls: { 75: 0.2 }, inp: { 75: 150 }, fid: { 75: 9 } }] }, errors: { results: [] }, ajax: { results: [] } };
    return { data: { data: { actor: { account: call.a.query.includes("timing:") ? account : { nrql: { results: discovered } } } } } };
  }
  if (sentryDown) throw httpError(500);
  if (url.endsWith("/organizations/")) return { data: [{ id: "123", slug: "fake-org" }] };
  return { data: { data: call.a.params.dataset === "spans" ? spans : errors } };
});

const { pageLoads } = await load("lib/analytics/SentryAnalytics.ts");
const { GET } = await load("app/api/metrics/route.ts");
const t = await load("lib/dashboardTransforms.ts");
const { DEFAULT_THRESHOLDS } = await load("lib/thresholds.ts");
const { TOOLS } = await load("lib/tools.ts");

mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-01-01T10:00:00Z") });
beforeEach(() => {
  calls.length = 0;
  sentryDown = false;
  spans = [span(`${site}/a`, 9, 600, 0.05, 30), span(`${site}/b`, 3, 400, null, 20)];
  errors = [{ url: `${site}/a`, title: "TypeError: x", "count()": 2, "last_seen()": "2026-01-01T09:00:00Z" }, { url: `${site}/c`, title: "Error: z", "count()": 7, "last_seen()": "2026-01-01T07:00:00Z" }];
  for (const k of [...Object.keys(FAKE), "NEWRELIC_REGION"]) delete process.env[k];
  mock.timers.tick(61_000); // past the poll memo and the page-discovery memo
});
const get = async (keys) => { Object.assign(process.env, keys); const res = await GET(); return { status: res.status, body: await res.json() }; };
const byUrl = (body) => Object.fromEntries(body.pages.map((p) => [p.url, p]));

test("pageLoads: counts are the sampled count; a vital nobody measured is absent, never 0", () => {
  const got = pageLoads([span(`${site}/a`, 9, 600, 0.05, 30), span(`${site}/b`, 3, 400, null, 20)]);
  assert.deepEqual(got["/a"], { traffic: { count: 9, sampled: true }, vitals: { lcp: 600, cls: 0.05, ttfb: 30 } });
  assert.deepEqual(got["/b"], { traffic: { count: 3, sampled: true }, vitals: { lcp: 400, ttfb: 20 } });
  assert.equal("inp" in got["/a"].vitals, false);
  // No vital at all: the page is still counted, with no `vitals` key.
  assert.deepEqual(pageLoads([span(`${site}/d`, 1, null, null, null)])["/d"], { traffic: { count: 1, sampled: true } });
});

test("pageLoads: query-string variants merge into one path, vitals weighted by count", () => {
  const got = pageLoads([span(`${site}/a`, 3, 600, 0.1, 30), span(`${site}/a?x=1`, 1, 1000, null, 70, 200), span(`${site}/A/`, 0, 5000, 0.9, 10)]);
  assert.deepEqual(Object.keys(got), ["/a"]);
  assert.equal(got["/a"].traffic.count, 4);
  // A zero-count row still carries a measurement, so it counts once.
  assert.equal(got["/a"].vitals.lcp, (600 * 3 + 1000 * 1 + 5000 * 1) / 5);
  assert.equal(got["/a"].vitals.inp, 200);
});

test("pageLoads: only pages served from this machine are listed", () => {
  const got = pageLoads([span("https://example.com/prod", 900, 100, 0, 10), span("http://127.0.0.1:3000/ok", 2, 100, 0, 10), { transaction: "/no-url", "count_sample()": 5 }, { url: `${site}/errors-shaped`, title: "x", "count()": 1 }]);
  assert.deepEqual(Object.keys(got), ["/ok"]);
});

test("Sentry only: it lists the pages itself, with sampled traffic, vitals and errors; no status and no New Relic field", async () => {
  const { status, body } = await get(SENTRY);
  assert.equal(status, 200);
  assert.deepEqual(body.sources, { pages: "sentry", traffic: "sentry", vitals: "sentry", errors: "sentry" });
  assert.deepEqual(body.failed, []);
  assert.equal(calls.filter((c) => c.url.includes("newrelic")).length, 0);
  const p = byUrl(body);
  assert.deepEqual(Object.keys(p).sort(), ["/a", "/b", "/c"]);
  assert.deepEqual(p["/a"].metrics, { traffic: { count: 9, sampled: true }, vitals: { lcp: 600, cls: 0.05, ttfb: 30 }, errors: { count: 2, latest: [{ title: "TypeError: x", count: 2, lastSeen: "2026-01-01T09:00:00Z" }] } });
  // Loaded, no errors: a real zero for errors, because Sentry answered.
  assert.deepEqual(p["/b"].metrics, { traffic: { count: 3, sampled: true }, vitals: { lcp: 400, ttfb: 20 }, errors: { count: 0, latest: [] } });
  // Errors but no sampled load: listed, with no traffic and no vitals.
  assert.deepEqual(p["/c"].metrics, { errors: { count: 7, latest: [{ title: "Error: z", count: 7, lastSeen: "2026-01-01T07:00:00Z" }] } });
  for (const page of body.pages) {
    assert.equal(page.status, undefined, "status needs load time, error rate and Apdex");
    assert.equal("newRelic" in page, false);
    assert.deepEqual(page.byTool.sentry, page.metrics);
  }
  // Most page loads first.
  assert.deepEqual(body.pages.map((x) => x.url), ["/a", "/b", "/c"]);
});

test("Sentry only: the two queries it sends", async () => {
  await get(SENTRY);
  const events = calls.filter((c) => c.url.endsWith("/events/")).map((c) => c.a.params);
  assert.equal(events.length, 2);
  const spansCall = events.find((p) => p.dataset === "spans");
  assert.equal(spansCall.query, "span.op:pageload is_transaction:true");
  assert.equal(spansCall.statsPeriod, "24h");
  // The stored count: count() on this dataset is scaled up from the sample rate.
  assert.ok(spansCall.field.includes("count_sample()") && !spansCall.field.includes("count()"));
  for (const f of ["url.full", "p75(measurements.lcp)", "p75(measurements.cls)", "p75(measurements.inp)", "p75(measurements.ttfb)"]) assert.ok(spansCall.field.includes(f), f);
  const errorsCall = events.find((p) => p.dataset === undefined);
  assert.deepEqual({ field: errorsCall.field, query: errorsCall.query, statsPeriod: errorsCall.statsPeriod, sort: errorsCall.sort, per_page: errorsCall.per_page }, { field: ["url", "title", "count()", "last_seen()"], query: "event.type:error", statsPeriod: "24h", sort: "-last_seen", per_page: 100 });
});

test("Sentry only, site sends no traces: pages with errors are still listed; nothing sent at all lists none", async () => {
  spans = [];
  let { body } = await get(SENTRY);
  assert.deepEqual(body.pages.map((p) => p.url).sort(), ["/a", "/c"]);
  for (const p of body.pages) assert.equal("traffic" in p.metrics || "vitals" in p.metrics, false);
  mock.timers.tick(61_000);
  errors = [];
  ({ body } = await get(SENTRY));
  assert.deepEqual(body.pages, []);
});

test("errors on pages not served from this machine are not counted, alone or beside New Relic", async () => {
  // The same Sentry project also receives production errors: one on a path that exists locally, one on a path that does not.
  errors = [...errors, { url: "https://example.com/a", title: "Prod error on /a", "count()": 50, "last_seen()": "2026-01-01T09:30:00Z" }, { url: "https://example.com/only-prod", title: "Prod only", "count()": 9, "last_seen()": "2026-01-01T09:40:00Z" }];
  let { body } = await get(SENTRY);
  assert.deepEqual(Object.keys(byUrl(body)).sort(), ["/a", "/b", "/c"], "a production-only path is not listed");
  assert.equal(byUrl(body)["/a"].metrics.errors.count, 2);
  assert.deepEqual(byUrl(body)["/a"].metrics.errors.latest.map((e) => e.title), ["TypeError: x"]);
  mock.timers.tick(61_000);
  ({ body } = await get({ ...NR, ...SENTRY }));
  assert.equal(body.pages[0].metrics.errors.count, 2, "beside New Relic too");
  assert.deepEqual(body.pages[0].sentry.latestErrors.map((e) => e.title), ["TypeError: x"]);
});

test("Sentry only: a failed read is an error naming Sentry, not an empty list", async () => {
  console.error = () => {};
  sentryDown = true;
  const { status, body } = await get(SENTRY);
  assert.equal(status, 500);
  assert.deepEqual(body, { error: "Could not load Sentry data." });
});

test("both tools: New Relic still supplies pages, traffic and vitals; Sentry's own numbers stay on its side", async () => {
  const { body } = await get({ ...NR, ...SENTRY });
  assert.equal(body.sources.pages, "new-relic");
  assert.equal(body.sources.traffic, "new-relic");
  assert.equal(body.sources.vitals, "new-relic");
  assert.equal(body.sources.errors, "sentry");
  // Only New Relic's page list: /b and /c exist in Sentry alone and are not added.
  assert.deepEqual(body.pages.map((p) => p.url), ["/a"]);
  const a = body.pages[0];
  assert.deepEqual(a.metrics.traffic, { count: 500 });
  assert.equal(a.metrics.vitals.lcp, 2000);
  assert.equal(a.metrics.errors.count, 2);
  assert.equal(a.status, "Healthy");
  assert.deepEqual(a.byTool.sentry, { traffic: { count: 9, sampled: true }, vitals: { lcp: 600, cls: 0.05, ttfb: 30 }, errors: a.metrics.errors });
});

test("screens: sampled traffic is labelled as sampled and shown as a plain count", async () => {
  const { body } = await get(SENTRY);
  const has = (cap) => body.sources[cap] !== undefined;
  assert.equal(t.isSampled(body.pages), true);
  assert.deepEqual(t.computeStats(body.pages, body.history, has, DEFAULT_THRESHOLDS).map((c) => [c.label, c.value]), [["Sampled page loads (24h)", "12"]]);
  // Sentry's tab shows its own page loads and vitals; "—" where nothing was measured.
  const cells = (url) => Object.fromEntries(TOOLS.sentry.columns.map((c) => [c.header, c.cell(byUrl(body)[url])]));
  assert.deepEqual([cells("/a")["Page loads (sampled)"], cells("/a").LCP, cells("/a").CLS, cells("/a").TTFB, cells("/a").INP], ["9", "600ms", "0.05", "30ms", "—"]);
  assert.deepEqual([cells("/c")["Page loads (sampled)"], cells("/c").LCP, cells("/c").CLS], ["—", "—", "—"]);
  mock.timers.tick(61_000);
  const both = (await get({ ...NR, ...SENTRY })).body;
  assert.equal(t.isSampled(both.pages), false);
  assert.equal(t.computeStats(both.pages, both.history, (cap) => both.sources[cap] !== undefined, DEFAULT_THRESHOLDS).find((c) => c.label === "Page views (24h)").value, "500");
});
