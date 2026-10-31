import { expect, test, type Locator, type Page } from "@playwright/test";
import { contains, fakeIntervals, stub, tick, type Stub } from "./helpers";

// The home dashboard never shows something it does not know: no invented AI suggestions when the analysis is
// unavailable, and no delta (arrow, "0ms", "0.00") when there is no earlier snapshot to compare with.
// The API is stubbed (FAKE fixtures only) in the shape /api/metrics and /api/analyze send.
const at = "2026-01-01T00:00:00.000Z";
const earlier = "2025-12-31T23:59:30.000Z";
const sources = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic" };
const pageWith = (vitals: { ttfb: number; lcp: number; cls: number }, recordedAt: string) => {
  const metrics = { traffic: { count: 40 }, loadTime: 1200, apdex: 0.95, vitals: { inp: 180, fid: 20, ...vitals }, errorRate: 0.2 };
  return { name: "FAKE Blog", slug: "blog", url: "/blog", visitors: "40", status: "Healthy", recordedAt, metrics, byTool: { "new-relic": metrics } };
};
const now = pageWith({ ttfb: 400, lcp: 2100, cls: 0.05 }, at);
// TTFB was slower, LCP was faster and CLS was the same.
const before = pageWith({ ttfb: 500, lcp: 2000, cls: 0.05 }, earlier);

const GREEN = "rgb(16, 185, 129)"; // the dash-success status token
const RED = "rgb(239, 68, 68)";
const ARROWS = "svg.lucide-arrow-up, svg.lucide-arrow-down";
const STAMP = "dashboard:lastAnalyzedAt";
const SUBTITLE = "Insights generated for all tracked pages";

type Reply = { statusCode?: number; body: object };
type Home = { metrics: Stub; analyze: Stub };
const visitHome = async (page: Page, history: { timestamp: string; pages: object[] }[], analyzeReply: Reply): Promise<Home> => {
  await page.setViewportSize({ width: 1440, height: 900 }); // sidebar labels and the header subtitle are hidden at narrower widths
  await stub(page, "GET", "/api/setup", { configured: true, tools: ["new-relic"], keys: {} });
  const metrics = await stub(page, "GET", "/api/metrics", { configured: true, tools: ["new-relic"], failed: [], sources, project: "fake-project", pages: [now], history: history.map((h) => ({ ...h, sources })), timestamp: at });
  await stub(page, "GET", "/api/timings", { items: [] });
  const analyze = await stub(page, "POST", "/api/analyze", analyzeReply);
  await page.goto("/");
  await analyze.wait();
  return { metrics, analyze };
};
const OK: Reply = { body: { alerts: [], recommendations: [] } };
const card = (page: Page, t: string) => contains(page, "[data-slot=card]", t);
const stamp = (page: Page) => expect.poll(() => page.evaluate((k) => localStorage.getItem(k), STAMP));
/** The card's text and how many delta arrows it holds. */
const read = (c: Locator) => c.evaluate((el, arrows) => ({ text: el.textContent ?? "", arrows: el.querySelectorAll(arrows).length }), ARROWS);

test.describe("AI suggestions card", () => {
  test("a real reply → the suggestions as rows, with the subtitle, and the day's run is recorded", async ({ page }) => {
    await visitHome(page, [{ timestamp: at, pages: [now] }], { body: { status: "ok", alerts: [{ severity: "high", page: "FAKE Blog", message: "FAKE: LCP is slow on this page", metric: "lcp" }], recommendations: ["FAKE: compress the hero image"] } });
    const c = card(page, "AI Suggestions");
    await expect(contains(c, SUBTITLE)).toBeVisible();
    await expect(c.locator("li")).toHaveCount(2);
    await expect(contains(c, "li", "FAKE: LCP is slow on this page")).toBeVisible();
    await expect(contains(c, "li", "FAKE: compress the hero image")).toBeVisible();
    await expect(c.locator('a[href="/setup"]')).toHaveCount(0);
    await stamp(page).not.toBeNull();
  });

  test("no AI key → one line saying it is off and a link to setup, no rows, no subtitle", async ({ page }) => {
    await visitHome(page, [{ timestamp: at, pages: [now] }], { body: { status: "unavailable", reason: "no_key" } });
    const c = card(page, "AI Suggestions");
    await expect(contains(c, "AI suggestions are off. Add an AI key to turn them on.")).toBeVisible();
    await expect(contains(c, 'a[href="/setup"]', "Open setup")).toBeVisible();
    await expect(c.locator("li")).toHaveCount(0);
    await expect(contains(c, SUBTITLE)).toHaveCount(0);
    await expect(contains(c, "No suggestions yet")).toHaveCount(0);
    await expect(contains(c, "could not be loaded")).toHaveCount(0);
    await stamp(page).toBeNull(); // nothing ran, so the next load asks again
  });

  const FAILURES: [string, Reply][] = [
    ["the provider failed", { body: { status: "unavailable", reason: "provider_error" } }],
    ["the provider's answer was unusable", { body: { status: "unavailable", reason: "bad_response" } }],
    ["/api/analyze answered 500", { statusCode: 500, body: { error: "FAKE failure" } }],
  ];
  for (const [name, reply] of FAILURES) {
    test(`${name} → one line saying it could not be loaded and a link to setup, no rows`, async ({ page }) => {
      await visitHome(page, [{ timestamp: at, pages: [now] }], reply);
      const c = card(page, "AI Suggestions");
      await expect(contains(c, "AI suggestions could not be loaded. Reload to try again, or check your AI key.")).toBeVisible();
      await expect(contains(c, 'a[href="/setup"]', "Open setup")).toBeVisible();
      await expect(c.locator("li")).toHaveCount(0);
      await expect(contains(c, SUBTITLE)).toHaveCount(0);
      await expect(contains(c, "AI suggestions are off")).toHaveCount(0);
      await stamp(page).toBeNull();
      // The rest of the dashboard is untouched by the failure.
      await expect(contains(page, "Avg Page Load Time")).toBeVisible();
      await expect(page.locator('div[role="status"]:not(.recharts-default-tooltip)')).toHaveCount(0); // no stale-data strip
      await expect(page.locator('tbody tr[data-slug="blog"]')).toBeVisible();
    });
  }
});

// A failed analysis call is tried again on the next page load, not on each 30s refresh. A missing key costs no
// call, so it is checked again on each refresh. Only the refresh timers are faked, as in refresh-failure.spec.ts.
test.describe("asking for the analysis again on the 30s refresh", () => {
  const READERS = 2; // the screen and the header each read /api/metrics
  const loadThenRefresh = async (page: Page, reason: string) => {
    await fakeIntervals(page);
    const { metrics, analyze } = await visitHome(page, [{ timestamp: at, pages: [now] }], { body: { status: "unavailable", reason } });
    for (let i = 0; i < READERS; i++) await metrics.wait();
    // The first load is over only once the card shows its answer; a tick before that overlaps two loads.
    await expect(contains(card(page, "AI Suggestions"), reason === "no_key" ? "AI suggestions are off." : "AI suggestions could not be loaded.")).toBeVisible();
    expect(analyze.calls).toHaveLength(1);
    await tick(page, 30000);
    for (let i = 0; i < READERS; i++) await metrics.wait(); // the refresh really ran: every reader asked for the metrics a second time
    expect(metrics.calls).toHaveLength(2 * READERS);
    return analyze;
  };

  for (const reason of ["provider_error", "bad_response"]) {
    test(`${reason} → the refresh does not ask again`, async ({ page }) => {
      const analyze = await loadThenRefresh(page, reason);
      await page.waitForTimeout(1000); // real time: the refresh has long since passed the point where it would ask
      expect(analyze.calls).toHaveLength(1);
      await expect(contains(card(page, "AI Suggestions"), "AI suggestions could not be loaded.")).toBeVisible();
    });
  }

  test("no_key → the refresh asks again", async ({ page }) => {
    const analyze = await loadThenRefresh(page, "no_key");
    await expect.poll(() => analyze.calls.length).toBe(2);
    await expect(contains(card(page, "AI Suggestions"), "AI suggestions are off.")).toBeVisible();
  });
});

test.describe("deltas on the home dashboard", () => {
  const VITALS = [["Time to First Byte", "400ms"], ["Largest Contentful Paint", "2.1s"], ["Cumulative Layout Shift", "0.05"]];

  test("first load, one snapshot → the vitals and the breakdown say 'No prior data yet', with no arrow and no zero delta", async ({ page }) => {
    await visitHome(page, [{ timestamp: at, pages: [now] }], OK);
    for (const [description, value] of VITALS) {
      const c = card(page, description);
      await expect(c).toContainText(value);
      await expect(c).toContainText("No prior data yet");
      await expect(c).not.toContainText(/\b0ms|0\.00|No change/);
      await expect(c.locator(ARROWS)).toHaveCount(0);
      const note = contains(c, "span", "No prior data yet").locator("xpath=..");
      await expect(note).not.toHaveCSS("color", GREEN);
      await expect(note).not.toHaveCSS("color", RED);
    }
    const apdex = card(page, "Avg Apdex (x100)");
    // The headline and both rows ("Pages with Apdex 0.9 or higher", "Pages Within Load Budget (1.5s)"; both name the user's limit).
    await expect.poll(async () => ((await read(apdex)).text.split("No prior data yet").length)).toBe(4);
    expect((await read(apdex)).arrows).toBe(0);
  });

  test("an empty history → the same, nothing to compare with", async ({ page }) => {
    await visitHome(page, [], OK);
    for (const [description] of VITALS) {
      const c = card(page, description);
      await expect(c).toContainText("No prior data yet");
      await expect(c).not.toContainText(/\b0ms|0\.00/);
      await expect(c.locator(ARROWS)).toHaveCount(0);
    }
  });

  test("a second snapshot → a decrease is a green down arrow, an increase a red up arrow, no change is 'No change' with no arrow", async ({ page }) => {
    await visitHome(page, [{ timestamp: earlier, pages: [before] }, { timestamp: at, pages: [now] }], OK);
    const ttfb = card(page, "Time to First Byte");
    await expect(contains(ttfb, "span", /^100ms$/).locator("xpath=..")).toHaveCSS("color", GREEN);
    await expect(ttfb.locator("svg.lucide-arrow-down")).toBeVisible();
    await expect(ttfb.locator("svg.lucide-arrow-up")).toHaveCount(0);
    const lcp = card(page, "Largest Contentful Paint");
    await expect(contains(lcp, "span", /^100ms$/).locator("xpath=..")).toHaveCSS("color", RED);
    await expect(lcp.locator("svg.lucide-arrow-up")).toBeVisible();
    await expect(lcp.locator("svg.lucide-arrow-down")).toHaveCount(0);
    const cls = card(page, "Cumulative Layout Shift");
    await expect(cls).toContainText("No change");
    await expect(cls).not.toContainText(/0\.00|No prior data yet/);
    await expect(cls.locator(ARROWS)).toHaveCount(0);
    const apdex = card(page, "Avg Apdex (x100)");
    await expect(apdex).toContainText("No change");
    await expect(apdex).not.toContainText("No prior data yet");
    await expect(apdex.locator(ARROWS)).toHaveCount(0);
  });
});
