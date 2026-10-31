import { expect, test, type Page } from "@playwright/test";
import { contains, fakeIntervals, stub, tick, type Stub } from "./helpers";

// A failed refresh of /api/metrics keeps the last good numbers and says so; it never turns into the setup prompt.
// The API is stubbed (FAKE fixtures only). Only the 30s refresh timers are faked, so the app itself runs normally.
const at = "2026-01-01T00:00:00.000Z";
const nrMetrics = { traffic: { count: 40 }, loadTime: 1200, apdex: 0.95, vitals: { lcp: 2100, cls: 0.05, inp: 180, ttfb: 400, fid: 20 }, errorRate: 0.2 };
const sources = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic" };
const pageRow = { name: "FAKE Blog", slug: "blog", url: "/blog", visitors: "40", status: "Healthy", recordedAt: at, metrics: nrMetrics, byTool: { "new-relic": nrMetrics } };
const good = { configured: true, tools: ["new-relic"], failed: [], sources, project: "fake-project", pages: [pageRow], history: [{ timestamp: at, sources, pages: [pageRow] }], timestamp: at };

let down = false;
let analyzeDelay = 0;
let analyzeAsked = false;
const REFRESH_MS = 30000;
const STALE = "Could not load the latest data.";
// Home's strip under the header. Found by its role, never by its text: the header prints the same sentence.
// Recharts' tooltip is role="status" too.
const STRIP = 'div[role="status"]:not(.recharts-default-tooltip)';
// The time is locale-formatted, e.g. "05:30", "5:30 AM".
const STRIP_TEXT = /^Could not load the latest data\. Showing numbers from \d{1,2}[:.]\d{2}(\s?[AP]\.?M\.?)?\.(Retrying…)?$/i;
// Every screen here has two readers of /api/metrics: the screen itself and the header.
const READERS = 2;

let timings: Stub, analyze: Stub, metrics: Stub;

test.beforeEach(async ({ page }) => {
  down = false;
  analyzeDelay = 0;
  analyzeAsked = false;
  await page.setViewportSize({ width: 1440, height: 900 }); // the header subtitle is hidden at narrower widths
  await stub(page, "GET", "/api/setup", { configured: true, tools: ["new-relic"], keys: {} });
  timings = await stub(page, "GET", "/api/timings", { items: [] });
  analyze = await stub(page, "POST", "/api/analyze", () => { analyzeAsked = true; return { delay: analyzeDelay, body: { alerts: [], recommendations: [] } }; });
  metrics = await stub(page, "GET", "/api/metrics", () => (down ? { statusCode: 500, body: { error: "Could not load New Relic data." } } : { statusCode: 200, body: good }));
  await fakeIntervals(page);
});
// Each reader starts its 30s interval in the same effect as its first fetch, so once every reader's response
// has arrived the intervals exist and a tick cannot fire into nothing.
const allRead = async () => { for (let i = 0; i < READERS; i++) await metrics.wait(); };
/** One refresh: tick the faked interval, then wait until every reader has had its answer. */
const refresh = async (page: Page, isDown: boolean) => {
  down = isDown;
  await tick(page, REFRESH_MS);
  await allRead();
};
const strip = (page: Page) => page.locator(STRIP);
const cell = (page: Page, t: RegExp) => contains(page, "td", t);

test.describe("a failed refresh", () => {
  test("home: the data stays with the failure line, never the setup prompt; a good refresh clears it", async ({ page }) => {
    await page.goto("/");
    await allRead();
    await analyze.wait(); // the first load is only over after its last request; a tick before that overlaps two loads
    await expect(contains(page, "Avg Page Load Time")).toBeVisible();
    await expect(cell(page, /^1\.2s$/)).toBeVisible();

    await refresh(page, true);
    await expect(strip(page)).toBeVisible();
    await expect.poll(() => strip(page).textContent()).toMatch(STRIP_TEXT);
    await expect(contains(page, "header p", STALE)).toBeVisible();
    await expect(cell(page, /^1\.2s$/)).toBeVisible();
    await expect(page.locator('tbody tr[data-slug="blog"]')).toBeVisible();
    await expect(contains(page, "Avg Page Load Time")).toBeVisible();
    await expect(contains(page, "Connect your data")).toHaveCount(0);
    await expect(contains(page, "Set up keys")).toHaveCount(0);

    await refresh(page, false);
    await timings.wait();
    await expect(strip(page)).toHaveCount(0);
    await expect(contains(page, STALE)).toHaveCount(0);
    await expect(cell(page, /^1\.2s$/)).toBeVisible();
  });

  test("home: a slow load that finishes after a newer failed refresh does not hide the failure", async ({ page }) => {
    analyzeDelay = 1500; // the first load is still waiting for its last request when the next refresh fails
    await page.goto("/");
    await allRead();
    // The first load has sent its last request and is waiting for the slow answer: only now do the two loads overlap there.
    await expect.poll(() => analyzeAsked, { message: "analyze requested" }).toBe(true);
    await expect(contains(page, "Avg Page Load Time")).toBeVisible();

    await refresh(page, true);
    await expect(strip(page)).toBeVisible();
    await analyze.wait(); // now the older, successful load has finished
    await expect(contains(page, "header p", STALE)).toBeVisible(); // gives the page a render after that
    await expect(strip(page)).toBeVisible();
    await expect.poll(() => strip(page).textContent()).toMatch(STRIP_TEXT);
    await expect(cell(page, /^1\.2s$/)).toBeVisible();
  });

  test("home: a failed first load shows an error with Retry, not the setup prompt or an endless skeleton", async ({ page }) => {
    down = true;
    await page.goto("/");
    await allRead();
    await expect(contains(page, "Could not load metrics")).toBeVisible();
    await expect(contains(page, "Failed to load live data.")).toBeVisible(); // the first-load card keeps this reason
    await expect(contains(page, "Send your first events")).toHaveCount(0); // Retry is the only action
    await expect(contains(page, "Connect your data")).toHaveCount(0);
    await expect(contains(page, "Set up keys")).toHaveCount(0);
    down = false;
    await contains(page, "button", "Retry").click();
    await metrics.wait();
    await expect(contains(page, "Avg Page Load Time")).toBeVisible();
  });

  test("performance: a failed refresh keeps the numbers and shows the line in the header; a later good one removes it", async ({ page }) => {
    await page.goto("/performance");
    await allRead();
    await expect(contains(page, "FAKE Blog")).toBeVisible();
    await expect(contains(page, "header p", "1 of 1 pages reporting")).toBeVisible();
    await expect(contains(page, STALE)).toHaveCount(0);

    await refresh(page, true);
    await expect(contains(page, "header p", STALE)).toBeVisible();
    await expect(contains(page, "header p", "1 of 1 pages reporting")).toBeVisible();
    await expect(contains(page, "FAKE Blog")).toBeVisible();
    await expect(cell(page, /^1\.2s$/)).toBeVisible();
    await expect(contains(page, "Could not load metrics")).toHaveCount(0);

    await refresh(page, false);
    await expect(contains(page, STALE)).toHaveCount(0);
    await expect(contains(page, "FAKE Blog")).toBeVisible();
  });
});
