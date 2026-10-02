import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { aggregateMetrics, num } = await load("lib/newrelic.ts");

test("num: percentile object, apdex object uses score (not the satisfied count), plain numbers", () => {
  assert.equal(num({ 75: 1.5 }), 1.5);
  assert.equal(num({ s: 12, t: 0, f: 0, score: 1 }), 1);
  assert.equal(num({ score: 0.85, s: 12, t: 3, f: 1 }), 0.85);
  assert.equal(num(7), 7);
  assert.equal(num(undefined), 0);
});

// Shape of the real run: duration 13.312s, LCP 13.4s, backendDuration 0.077s, 12 views, apdex object with s=12.
const account = {
  views: { results: [{ pageUrl: "http://localhost:3000/search?x=1", loadTime: { 75: 13.312 }, ttfb: { 75: 0.077 }, views: 12, apdex: { s: 12, t: 0, f: 0, score: 0.5 } }] },
  timing: { results: [{ pageUrl: "http://localhost:3000/search?x=1", lcp: { 75: 13.4 }, cls: { 75: 0.1 }, inp: { 75: 40 }, fid: { 75: 5 } }] },
  errors: { results: [{ pageUrl: "http://localhost:3000/search", errors: 3 }] },
};

test("durations and LCP are converted seconds -> ms; apdex stays 0-1; throughput is the view count", () => {
  const m = aggregateMetrics(account)["/search"];
  assert.equal(Math.round(m.loadTime), 13312);
  assert.equal(Math.round(m.ttfb), 77);
  assert.equal(Math.round(m.lcp), 13400);
  assert.equal(m.apdexScore, 0.5);
  assert.equal(m.throughput, 12);
  assert.ok(m.apdexScore <= 1);
  assert.equal(m.errorRate, 25);
  assert.equal(m.inp, 40);
});

test("query-string variants merge by view-weighted average; empty input gives empty result", () => {
  const two = { views: { results: [
    { pageUrl: "/a?x=1", loadTime: { 75: 1 }, ttfb: { 75: 0 }, views: 1, apdex: { score: 1 } },
    { pageUrl: "/a?x=2", loadTime: { 75: 3 }, ttfb: { 75: 0 }, views: 3, apdex: { score: 0 } },
  ] } };
  const m = aggregateMetrics(two)["/a"];
  assert.equal(m.throughput, 4);
  assert.equal(Math.round(m.loadTime), 2500);
  assert.equal(m.apdexScore, 0.25);
  assert.deepEqual(aggregateMetrics({ views: { results: [] } }), {});
});
