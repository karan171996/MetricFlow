// Lighthouse parser: run selection, merging, skipping, the 500-run cap and the fixtures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load, root } from "./helpers.mjs";

const { parseLighthouse } = await load("lib/lighthouse.ts");
const fixture = (n) => JSON.parse(readFileSync(join(root, "test/fixtures", `lighthouse-${n}.json`), "utf8"));

const run = (url, score, { t = "2026-01-01T00:00:00Z", lcp = score * 1000, cls = 0.1, tbt = 50, ...extra } = {}) => ({
  finalUrl: url, fetchTime: t, categories: { performance: { score } },
  audits: { "largest-contentful-paint": { numericValue: lcp }, "cumulative-layout-shift": { numericValue: cls }, "total-blocking-time": { numericValue: tbt } }, ...extra
});

test("odd count picks the middle run, even count the lower of the two middles", () => {
  assert.equal(parseLighthouse([run("/a", 0.9), run("/a", 0.5), run("/a", 0.7)])["/a"].lighthouse.score, 70);
  assert.equal(parseLighthouse([run("/a", 0.9), run("/a", 0.5)])["/a"].lighthouse.score, 50);
  assert.equal(parseLighthouse([run("/a", 0.5)])["/a"].lighthouse.score, 50);
});

test("ties on score are broken by fetchTime, earliest first, whatever the input order", () => {
  const rs = [run("/a", 0.5, { t: "2026-01-03T00:00:00Z", lcp: 3 }), run("/a", 0.5, { t: "2026-01-01T00:00:00Z", lcp: 1 }), run("/a", 0.5, { t: "2026-01-02T00:00:00Z", lcp: 2 })];
  assert.equal(parseLighthouse(rs)["/a"].lighthouse.lcp, 2);
  assert.equal(parseLighthouse(rs.slice().reverse())["/a"].lighthouse.lcp, 2);
  // even tie: the earlier of the two
  assert.equal(parseLighthouse([rs[0], rs[1]])["/a"].lighthouse.lcp, 1);
  // a missing fetchTime sorts first and does not throw
  const noTime = run("/a", 0.5, { lcp: 9 }); delete noTime.fetchTime;
  assert.equal(parseLighthouse([rs[1], noTime])["/a"].lighthouse.lcp, 9);
});

test("whole run: every metric comes from the one selected run, never mixed", () => {
  const out = parseLighthouse([
    run("/a", 0.4, { lcp: 111, cls: 0.91, tbt: 911 }),
    run("/a", 0.6, { lcp: 222, cls: 0.02, tbt: 22 }),
    run("/a", 0.95, { lcp: 333, cls: 0.01, tbt: 11 }),
  ]);
  assert.deepEqual(out["/a"].lighthouse, { score: 60, lcp: 222, cls: 0.02, tbt: 22 });
});

test("query strings and hosts merge into one path; distinct paths stay apart", () => {
  const out = parseLighthouse([run("https://prod.example/a?x=1", 0.3), run("http://localhost:3000/a?x=2", 0.5), run("/a", 0.9), run("/b", 0.8)]);
  assert.deepEqual(Object.keys(out).sort(), ["/a", "/b"]);
  assert.equal(out["/a"].lighthouse.score, 50);
});

test("url precedence: finalDisplayedUrl, then finalUrl, then requestedUrl; none means skipped", () => {
  const r = { ...run(undefined, 0.5), finalUrl: "/final", finalDisplayedUrl: "/shown", requestedUrl: "/req" };
  assert.deepEqual(Object.keys(parseLighthouse(r)), ["/shown"]);
  delete r.finalDisplayedUrl;
  assert.deepEqual(Object.keys(parseLighthouse(r)), ["/final"]);
  delete r.finalUrl;
  assert.deepEqual(Object.keys(parseLighthouse(r)), ["/req"]);
  delete r.requestedUrl;
  assert.deepEqual(parseLighthouse(r), {});
});

test("non-reports are skipped without throwing", () => {
  const bad = [null, undefined, 5, "str", true, {}, [], [[run("/n", 0.5)]], { categories: {}, audits: {} }, { categories: { performance: { score: 0.5 } } },
    { categories: { performance: { score: 0.5 } }, audits: [] }, run("/s", "0.5"), run("/s", NaN), run("/s", Infinity), run("/s", null),
    run("/e", 0.5, { runtimeError: { code: "NO_FCP" } })];
  assert.deepEqual(parseLighthouse(bad), {});
  assert.deepEqual(parseLighthouse(null), {});
  assert.deepEqual(parseLighthouse(undefined), {});
  assert.deepEqual(parseLighthouse("x"), {});
  // a good run among the bad still comes through
  assert.deepEqual(Object.keys(parseLighthouse([...bad, run("/ok", 0.5)])), ["/ok"]);
});

test("score is clamped to 0-100; audits that are missing, non-numeric or non-finite stay absent", () => {
  assert.equal(parseLighthouse(run("/a", 1.7))["/a"].lighthouse.score, 100);
  assert.equal(parseLighthouse(run("/a", -0.3))["/a"].lighthouse.score, 0);
  const r = run("/a", 0.5);
  r.audits["largest-contentful-paint"] = { numericValue: "2100" };
  r.audits["cumulative-layout-shift"] = { numericValue: NaN };
  r.audits["total-blocking-time"] = null;
  assert.deepEqual(parseLighthouse(r)["/a"].lighthouse, { score: 50 });
});

test("500-run cap: the cap counts raw entries, so run 501 is ignored, invalid entries included", () => {
  const ok = Array.from({ length: 500 }, () => run("/a", 0.5));
  assert.deepEqual(Object.keys(parseLighthouse([...ok, run("/late", 0.5)])), ["/a"]);
  assert.deepEqual(Object.keys(parseLighthouse([...ok.slice(0, 499), run("/last", 0.5)])).sort(), ["/a", "/last"]);
  assert.deepEqual(parseLighthouse([...Array.from({ length: 500 }, () => null), run("/late", 0.5)]), {});
});

test("fixtures: single, array, three-runs (the 0.85 run), runtime-error and manifest", () => {
  assert.deepEqual(parseLighthouse(fixture("single")), { "/": { lighthouse: { score: 92, lcp: 2100, cls: 0.05, tbt: 150 } } });
  const arr = parseLighthouse(fixture("array"));
  assert.deepEqual(Object.keys(arr).sort(), ["/", "/pricing"]);
  assert.equal(arr["/"].lighthouse.score, 92);
  assert.equal(arr["/pricing"].lighthouse.score, 71);
  const three = parseLighthouse(fixture("three-runs"));
  assert.deepEqual(Object.keys(three), ["/"]);
  assert.equal(three["/"].lighthouse.score, 85);
  assert.deepEqual(parseLighthouse(fixture("runtime-error")), {});
  assert.deepEqual(parseLighthouse(fixture("manifest")), {});
});
