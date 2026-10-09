// C1 proof of "no behaviour change": the /api/metrics body, for fixed upstream answers, must equal
// what main produced before C1 (test/fixtures/c1-*.json), and the home-screen transforms must equal the fixtures.
// The fixtures were written by this file on main (297d396): C1_CAPTURE=1 pnpm run test:cli
// Their `transforms` sections were then edited by hand for the dashboard-trust fix (honest labels, no delta
// without a prior value) and for the one health rule (tile status and limit, the load limit in the row label),
// so they no longer equal main. Do not re-capture: that would rewrite the bodies too.
// Sentry-only is no longer part of this proof: it changed on purpose when Sentry began to list pages
// and supply vitals (test/sentry-pages.test.mjs). New Relic only and both tools must still not move.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FAKE, httpError, load, mockAxios, root } from "./helpers.mjs";

const NR = { NEWRELIC_API_KEY: FAKE.NEWRELIC_API_KEY, NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID: FAKE.NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID };
const site = "http://localhost:3001";

// The transforms print clock times; pin locale and zone so the fixtures do not depend on the machine.
const localTime = Date.prototype.toLocaleTimeString;
Date.prototype.toLocaleTimeString = function (_locale, options) { return localTime.call(this, "en-US", { ...options, timeZone: "UTC" }); };
const localNumber = Number.prototype.toLocaleString;
Number.prototype.toLocaleString = function () { return localNumber.call(this, "en-US"); };

// /a: every kind of row, in two query-string variants. /b: views but no timing rows (LCP/CLS/INP are legacy zeros).
// /c: discovered, but no New Relic metrics row at all (all legacy zeros), with Sentry errors.
const discovered = [{ pageUrl: `${site}/a`, views: 1500 }, { pageUrl: `${site}/a?x=1`, views: 100 }, { pageUrl: `${site}/b`, views: 40 }, { pageUrl: `${site}/c`, views: 3 }];
const account = (round) => ({
  views: { results: [
    { pageUrl: `${site}/a`, views: 1500, loadTime: { 75: 0.8 + round }, ttfb: { 75: 0.12 }, apdex: { score: 0.95 - round / 10, s: 1, t: 0, f: 0 } },
    { pageUrl: `${site}/a?x=1`, views: 100, loadTime: { 75: 2.4 }, ttfb: { 75: 0.3 }, apdex: { score: 0.7 } },
    { pageUrl: `${site}/b`, views: 40, loadTime: { 75: 3.2 - round }, ttfb: { 75: 0.5 }, apdex: { score: 0.6 + round / 5 } },
  ] },
  timing: { results: [{ pageUrl: `${site}/a`, lcp: { 75: 1.9 }, cls: { 75: 0.08 }, inp: { 75: 180 }, fid: { 75: 12 } }] },
  errors: { results: [{ pageUrl: `${site}/a`, errors: 48 + round }] },
  ajax: { results: [{ pageUrl: `${site}/a`, ajaxLatency: 0.25, ajaxCalls: 200, ajaxFailed: 6 }] },
});
const events = [
  { url: `${site}/a`, title: "TypeError: x is undefined", "count()": 3, "last_seen()": "2026-01-01T09:00:00Z" },
  { url: `${site}/a?x=1`, title: "RangeError: y", "count()": 1, "last_seen()": "2026-01-01T08:00:00Z" },
  { url: `${site}/c`, title: "Error: z", "count()": 7, "last_seen()": "2026-01-01T07:00:00Z" },
];

let round = 0;
let sentryDown = false;
mockAxios((method, url, call) => {
  if (url.includes("newrelic")) {
    return { data: { data: { actor: { account: call.a.query.includes("timing:") ? account(round) : { nrql: { results: discovered } } } } } };
  }
  if (sentryDown) throw httpError(500);
  return { data: url.endsWith("/organizations/") ? [{ id: "123", slug: "fake-org" }] : { data: events } };
});

const { GET } = await load("app/api/metrics/route.ts");
const t = await load("lib/dashboardTransforms.ts");
const { DEFAULT_THRESHOLDS } = await load("lib/thresholds.ts");
const { withNeutralShape } = process.env.C1_CAPTURE ? {} : await load("lib/legacyMetrics.ts");

/** One GET with the given keys, plus what the home screen computes from that body. */
async function run(keys) {
  for (const k of Object.keys(FAKE)) delete process.env[k];
  Object.assign(process.env, keys, { METRICFLOW_PROJECT_NAME: "fake-project" });
  mock.timers.tick(61_000); // past the 60s page-discovery memo
  const body = await (await GET()).json();
  // The home screen runs the transforms only when there are pages. `has` is new in C1; main ignores the extra argument.
  const has = (cap) => body.sources?.[cap] !== undefined && !(body.failed ?? []).includes(body.sources[cap]);
  const transforms = body.pages.length ? {
    stats: t.computeStats(body.pages, body.history, has, DEFAULT_THRESHOLDS),
    webVitals: t.computeWebVitals(body.pages, body.history, has),
    cwvTrend: t.computeCwvTrend(body.history, has),
    visibility: t.computeVisibilityBreakdown(body.pages, body.history, has, DEFAULT_THRESHOLDS),
    whatMoved: t.computeWhatMoved(body.pages, body.history, has),
  } : null;
  return { body, transforms };
}

/** The fields C1 adds. Everything else must not move. */
const withoutNew = (v) =>
  Array.isArray(v) ? v.map(withoutNew)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([k]) => !["sources", "metrics", "byTool"].includes(k)).map(([k, x]) => [k, withoutNew(x)]))
  : v;

test("C1: /api/metrics legacy fields are the same as on main, and every transform output matches the fixtures", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-01-01T10:00:00Z") });
  console.error = () => {}; // the Sentry-down round logs its status

  // The history ring lives in the module, so the order matters: later rounds carry the earlier snapshots.
  mock.timers.tick(61_000); // the fixtures' clock includes the Sentry-only round that used to run first
  const got = { "new-relic-only": [await run(NR)], both: [await run(FAKE)] };
  round = 1;
  got.both.push(await run(FAKE));
  sentryDown = true;
  got.both.push(await run(FAKE));

  assert.equal(got.both[1].transforms.whatMoved.improved.length + got.both[1].transforms.whatMoved.regressed.length, 2, "fixture must move pages");
  for (const [name, runs] of Object.entries(got)) {
    const file = join(root, "test/fixtures", `c1-${name}.json`);
    if (process.env.C1_CAPTURE) { writeFileSync(file, JSON.stringify(runs, null, 2) + "\n"); continue; }
    const before = JSON.parse(readFileSync(file, "utf8"));
    runs.forEach((r, i) => {
      // Compared as text, so key order and absent fields count too.
      assert.equal(JSON.stringify(withoutNew(r.body), null, 2), JSON.stringify(before[i].body, null, 2), `${name} #${i}: body`);
      assert.deepEqual(r.transforms, before[i].transforms, `${name} #${i}: transforms`);
      // A body with only the old fields (what the Cypress stubs send) is filled in by the client to exactly what the route now sends.
      // History is left out: an old snapshot does not say which tools were connected then, so the client assumes today's.
      const filled = JSON.parse(JSON.stringify(withNeutralShape(before[i].body)));
      for (const k of ["sources", "pages"]) assert.deepEqual(filled[k], r.body[k], `${name} #${i}: client fill of ${k}`);
    });
  }
});
