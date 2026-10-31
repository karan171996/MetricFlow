import { expect, test, type Page } from "@playwright/test";
import { contains, stub } from "./helpers";

// tool-tabs-by-key section 11 D, with the API stubbed (FAKE fixtures only):
// a one-tool install never shows the other tool; a two-tool install is unchanged.
const nr = { loadTime: 1200, lcp: 2.1, ttfb: 0.4, cls: 0.05, fid: 20, errorRate: 0.2, throughput: 40, apdexScore: 0.95 };
const row = (withSentry: boolean) => ({
  name: "FAKE Blog", slug: "blog", url: "/blog", visitors: "40", status: "Healthy", newRelic: nr,
  ...(withSentry ? { sentry: { errorCount: 2, errorRate: 0, warningCount: 0, latestErrors: [] } } : {}),
  recordedAt: "2026-01-01T00:00:00.000Z",
});
// The sidebar reads connected tools from GET /api/setup; the pages read /api/metrics. Stub both.
const setup = async (page: Page, tools: string[]) => {
  await page.setViewportSize({ width: 1440, height: 900 }); // sidebar labels are hidden at the default 1000px width
  await stub(page, "GET", "/api/setup", { configured: true, tools, keys: {} });
  await stub(page, "GET", "/api/metrics", { configured: true, tools, pages: [row(tools.includes("sentry"))], history: [] });
};

test.describe("fresh install, New Relic keys only", () => {
  test.beforeEach(({ page }) => setup(page, ["new-relic"]));

  test("dashboard shows data and the word Sentry appears nowhere except 'Add a tool'", async ({ page }) => {
    for (const path of ["/performance", "/performance/blog"]) {
      await page.goto(path);
      await expect(contains(page, "FAKE Blog")).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.body.innerText)).not.toMatch(/sentry/i); // visible text, not the RSC payload
      await expect(page.locator('a[href="/tools/new-relic"]').first()).toBeAttached();
      await expect(page.locator('a[href="/tools/sentry"]')).toHaveCount(0);
      await expect(page.locator('a[href="/setup"]').first()).toBeAttached(); // "Add a tool"
    }
  });

  test("setup saves one complete group: only New Relic keys are sent", async ({ page }) => {
    const save = await stub(page, "POST", "/api/setup", { saved: true, results: {} });
    await page.goto("/setup");
    await page.locator("#NEWRELIC_API_KEY").fill("FAKE-1");
    await page.locator("#NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID").fill("1234567");
    await contains(page, "button", "Check and save").click();
    const body = (await save.wait()).postDataJSON();
    expect(Object.keys(body).sort()).toEqual(["NEWRELIC_API_KEY", "NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID"]);
  });
});

test.describe("every tool connected: same as before", () => {
  test("shows the Sentry tab and no 'Add a tool'", async ({ page }) => {
    await setup(page, ["new-relic", "sentry", "lighthouse"]);
    await page.goto("/performance");
    await expect(contains(page, "FAKE Blog")).toBeVisible();
    await expect(page.locator('a[href="/tools/sentry"]').first()).toBeAttached();
    await expect(page.locator('a[href="/setup"]')).toHaveCount(0); // no "Add a tool" when every tool is connected
  });
});
