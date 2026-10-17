// Lighthouse runs on LIGHTHOUSE_TARGET: target check, discovery, the run loop, caps, the single-run lock, the fixed errors.
// The fetcher and the runner are stubs: no network, no Chrome.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const run = await load("lib/lighthouseRun.ts");
const { checkTarget, discoverPages, startRun, maybeStartRun, getStatus, getResults, resetRun, deps, NOT_INSTALLED, NO_CHROME, TARGET_INVALID, TARGET_UNREACHABLE, STALE_MS } = run;

const T = "http://localhost:3001";
const lhr = (url, score = 0.9) => ({
  finalDisplayedUrl: url, fetchTime: "2026-01-01T00:00:00Z", categories: { performance: { score } },
  audits: { "largest-contentful-paint": { numericValue: 1200 }, "cumulative-layout-shift": { numericValue: 0.05 }, "total-blocking-time": { numericValue: 80 } },
});
/** A fetcher answering from a map of url -> { status, body, location } (missing = 404), recording each call. */
const site = (pages) => {
  const calls = [];
  const fetcher = async (url) => { calls.push(url); const p = pages[url]; if (p instanceof Error) throw p; return p ? { status: 200, body: "", ...p } : { status: 404, body: "" }; };
  return Object.assign(fetcher, { calls });
};
const never = () => new Promise(() => {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const realDeps = { ...deps };
beforeEach(() => {
  resetRun();
  Object.assign(deps, realDeps);
  // A test that forgets to stub must fail, never reach the network or Chrome.
  deps.fetcher = async () => { throw new Error("unstubbed fetcher"); };
  deps.runner = async () => { throw new Error("unstubbed runner"); };
  deps.load = async () => { throw new Error("unstubbed load"); };
  process.env.LIGHTHOUSE_TARGET = T;
});

test("checkTarget: http(s) only, no credentials, root must answer 2xx; fixed text never echoes the value", async () => {
  const up = site({ [`${T}/`]: { body: "<html>" } });
  assert.deepEqual(await checkTarget(T, up), { ok: true });
  assert.deepEqual(await checkTarget("http://192.168.1.20:8080/some/path", site({ "http://192.168.1.20:8080/": {} })), { ok: true });
  for (const bad of ["ftp://localhost:3001", "file:///etc/passwd", "javascript:alert(1)", "localhost:3001", "not a url", "http://user:SECRETPW@localhost:3001", "http://user@localhost:3001"]) {
    const r = await checkTarget(bad, up);
    assert.deepEqual(r, { ok: false, error: TARGET_INVALID }, bad);
  }
  const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  for (const fetcher of [site({}), site({ [`${T}/`]: { status: 500 } }), site({ [`${T}/`]: timeout }), site({ [`${T}/`]: { status: 302, location: "https://elsewhere.example/" } })]) {
    const r = await checkTarget(`${T}/secret-PATH`, fetcher);
    assert.deepEqual(r, { ok: false, error: TARGET_UNREACHABLE });
  }
  for (const t of [TARGET_INVALID, TARGET_UNREACHABLE]) assert.ok(!/localhost|3001|SECRET|PATH|timeout/i.test(t));
  // a same-origin redirect is followed
  assert.deepEqual(await checkTarget(T, site({ [`${T}/`]: { status: 307, location: "/home" }, [`${T}/home`]: {} })), { ok: true });
});

test("discovery: / first, then sitemap order; same-origin, normalised, de-duplicated, assets dropped", async () => {
  const sitemap = `<?xml version="1.0"?><urlset>
    <url><loc>${T}/Blog/</loc></url><url><loc> ${T}/pricing?utm=1 </loc></url><url><loc>${T}/blog</loc></url>
    <url><loc>https://evil.example/steal</loc></url><url><loc>http://localhost:4000/other-port</loc></url>
    <url><loc>${T}/logo.png</loc></url><url><loc>${T}/feed.xml</loc></url><url><loc>${T}/about.html</loc></url>
    <url><loc>${T}/</loc></url><url><loc>${T}/a&amp;b</loc></url></urlset>`;
  const f = site({ [`${T}/sitemap.xml`]: { body: sitemap }, [`${T}/`]: { body: '<a href="/never-read">' } });
  const pages = await discoverPages(`${T}/ignored/path`, f);
  assert.deepEqual(pages.map((p) => p.path), ["/", "/blog", "/pricing", "/about.html", "/a&b"]);
  assert.equal(pages[1].url, `${T}/Blog/`, "the run keeps the path's case");
  assert.deepEqual(f.calls, [`${T}/sitemap.xml`], "the root is not read when the sitemap has paths");
});

test("discovery: no sitemap -> one level of same-origin root links; capped at 20", async () => {
  const links = ['<a href="/docs">', "<a class='x' href='/Team/'>", '<a href="https://other.example/x">', '<a href="mailto:a@b.c">', '<a href="/img/a.jpg">', '<a href="#top">', '<a href="/docs?x=2">',
    ...Array.from({ length: 40 }, (_, i) => `<a href="/p${i}">`)].join("");
  const f = site({ [`${T}/`]: { body: links }, [`${T}/docs`]: { body: '<a href="/deeper">' } });
  const pages = await discoverPages(T, f);
  assert.equal(pages.length, 20);
  assert.deepEqual(pages.slice(0, 4).map((p) => p.path), ["/", "/docs", "/team", "/p0"]);
  assert.ok(!pages.some((p) => p.path === "/deeper" || p.path.includes("img") || p.path === "/x"));
  assert.deepEqual(f.calls, [`${T}/sitemap.xml`, `${T}/`], "no deeper crawl");
  // an unreachable site still yields /
  assert.deepEqual((await discoverPages(T, site({}))).map((p) => p.path), ["/"]);
});

test("a run calls the runner once per page, in sequence, and parses each LHR into score/lcp/cls/tbt", async () => {
  const f = site({ [`${T}/sitemap.xml`]: { body: `<loc>${T}/a</loc><loc>${T}/b</loc>` } });
  let active = 0;
  const seen = [];
  const runner = async (url) => { assert.equal(active++, 0, "pages run one after another"); seen.push(url); await sleep(5); active--; return lhr(url, url.endsWith("/a") ? 0.5 : 0.95); };
  const p = startRun({ fetcher: f, runner });
  assert.equal(getStatus().state, "running");
  await p;
  assert.deepEqual(seen, [`${T}/`, `${T}/a`, `${T}/b`]);
  assert.deepEqual(getResults(T), {
    "/": { lighthouse: { score: 95, lcp: 1200, cls: 0.05, tbt: 80 } },
    "/a": { lighthouse: { score: 50, lcp: 1200, cls: 0.05, tbt: 80 } },
    "/b": { lighthouse: { score: 95, lcp: 1200, cls: 0.05, tbt: 80 } },
  });
  const s = getStatus();
  assert.equal(s.state, "idle");
  assert.equal(s.done, 3);
  assert.equal(s.total, 3);
  assert.ok(Date.parse(s.lastRunAt) > 0);
  assert.equal(s.error, undefined);
  assert.deepEqual(getResults("http://localhost:9999"), {}, "results belong to their target");
});

test("a page that fails, times out or redirects off the origin is skipped and the run continues", async () => {
  const f = site({ [`${T}/sitemap.xml`]: { body: `<loc>${T}/fails</loc><loc>${T}/hangs</loc><loc>${T}/away</loc><loc>${T}/ok</loc>` } });
  let aborted = false;
  const runner = (url, signal) => {
    if (url.endsWith("/fails")) return Promise.reject(new Error("Lighthouse said something with " + url));
    if (url.endsWith("/hangs")) { signal.addEventListener("abort", () => (aborted = true)); return never(); }
    if (url.endsWith("/away")) return Promise.resolve(lhr("https://elsewhere.example/landed"));
    return Promise.resolve(lhr(url));
  };
  await startRun({ fetcher: f, runner, pageMs: 30 });
  assert.deepEqual(Object.keys(getResults(T)).sort(), ["/", "/ok"]);
  assert.ok(aborted, "the timed-out page's runner was told to stop");
  assert.equal(getStatus().state, "idle");
  assert.equal(getStatus().done, 5);
});

test("the total cap stops the run and keeps the pages already measured", async () => {
  const f = site({ [`${T}/sitemap.xml`]: { body: `<loc>${T}/a</loc><loc>${T}/b</loc><loc>${T}/c</loc>` } });
  const seen = [];
  const runner = async (url) => { seen.push(url); await sleep(40); return lhr(url); };
  await startRun({ fetcher: f, runner, totalMs: 100 });
  assert.ok(seen.length >= 2 && seen.length < 4, `ran ${seen.length}`);
  assert.ok(Object.keys(getResults(T)).length >= 2 && Object.keys(getResults(T)).length < 4);
  assert.ok(getResults(T)["/"], "measured pages are kept");
  assert.equal(getStatus().state, "idle");
});

test("starting a second run while one is running joins it: the runner is not started again", async () => {
  const f = site({});
  let calls = 0;
  let release;
  const runner = () => { calls++; return new Promise((r) => (release = () => r(lhr(`${T}/`)))); };
  const a = startRun({ fetcher: f, runner });
  const b = startRun({ fetcher: f, runner });
  maybeStartRun();
  assert.equal(a, b);
  while (!release) await sleep(1);
  release();
  await a;
  assert.equal(calls, 1);
});

test("the lazy schedule: runs when never run, target changed or over 60 min old; never twice at once", async () => {
  let calls = 0;
  deps.fetcher = site({});
  deps.runner = async (url) => { calls++; return lhr(url); };
  maybeStartRun();
  maybeStartRun();
  while (getStatus().state === "running") await sleep(1);
  assert.equal(calls, 1);
  const last = Date.parse(getStatus().lastRunAt);
  maybeStartRun(last + 60_000);
  assert.equal(getStatus().state, "idle", "fresh: no run");
  maybeStartRun(last + STALE_MS + 1);
  assert.equal(getStatus().state, "running", "stale: runs");
  while (getStatus().state === "running") await sleep(1);
  process.env.LIGHTHOUSE_TARGET = "http://localhost:3002";
  maybeStartRun(last);
  assert.equal(getStatus().state, "running", "a new target runs at once");
  while (getStatus().state === "running") await sleep(1);
  delete process.env.LIGHTHOUSE_TARGET;
  maybeStartRun(last + STALE_MS * 10);
  assert.equal(getStatus().state, "idle", "no target: nothing runs");
  assert.equal(calls, 3);
});

test("package missing or Chrome missing: state error with the exact fixed text (lazy import / launcher throwing)", async () => {
  deps.fetcher = site({ [`${T}/sitemap.xml`]: { body: `<loc>${T}/a</loc>` } });
  deps.runner = realDeps.runner;
  deps.load = async () => { throw new Error("Cannot find package 'lighthouse' imported from /secret/path"); };
  await startRun();
  assert.deepEqual({ state: getStatus().state, error: getStatus().error }, { state: "error", error: NOT_INSTALLED });
  assert.equal(NOT_INSTALLED, "Lighthouse is not installed. Reinstall MetricFlow to add it.");

  let lhCalls = 0;
  deps.load = async () => ({ lighthouse: async () => { lhCalls++; }, launch: async () => { throw new Error("ERR_LAUNCHER_NOT_INSTALLED at /secret/path"); } });
  await startRun();
  assert.deepEqual({ state: getStatus().state, error: getStatus().error }, { state: "error", error: NO_CHROME });
  assert.equal(NO_CHROME, "Lighthouse needs Google Chrome installed on this machine.");
  assert.equal(lhCalls, 0);
  assert.equal(getStatus().done, 0, "a fatal error stops the run at the first page");
});

test("the real runner kills Chrome in finally, on success, failure and timeout, and passes only the port", async () => {
  deps.fetcher = site({ [`${T}/sitemap.xml`]: { body: `<loc>${T}/fails</loc><loc>${T}/hangs</loc>` } });
  deps.runner = realDeps.runner;
  let launched = 0, killed = 0;
  const flagsSeen = [];
  deps.load = async () => ({
    launch: async (opts) => { launched++; assert.ok(opts.chromeFlags.includes("--headless=new")); return { port: 9222, kill: async () => { killed++; } }; },
    lighthouse: (url, flags) => {
      flagsSeen.push(flags);
      if (url.endsWith("/fails")) return Promise.reject(new Error("boom"));
      if (url.endsWith("/hangs")) return never();
      return Promise.resolve({ lhr: lhr(url) });
    },
  });
  await startRun({ pageMs: 30 });
  assert.equal(launched, 3);
  assert.equal(killed, 3);
  assert.deepEqual(Object.keys(getResults(T)), ["/"]);
  for (const f of flagsSeen) assert.deepEqual(Object.keys(f).sort(), ["logLevel", "onlyCategories", "output", "port"]);
});
