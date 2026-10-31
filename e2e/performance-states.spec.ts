import { expect, test, type Page } from "@playwright/test";
import { contains, stub } from "./helpers";

// /performance states with /api/metrics stubbed. All values are fake test fixtures.
const nr = (o = {}) => ({ loadTime: 0, lcp: 0, ttfb: 0, cls: 0, fid: 0, errorRate: 0, throughput: 0, apdexScore: 0, ...o });
const pageOf = (slug: string, o: { nr?: object; errors?: object[] } = {}) => ({
  name: `FAKE ${slug}`, slug, url: `/${slug}`, visitors: "0", status: "healthy",
  newRelic: nr(o.nr),
  sentry: { errorCount: o.errors?.length ?? 0, errorRate: 0, warningCount: 0, latestErrors: o.errors ?? [] },
  recordedAt: "2026-01-01T00:00:00.000Z",
});
const metrics = (page: Page, body: object, statusCode = 200) =>
  stub(page, "GET", "/api/metrics", { statusCode, body: { tools: (body as { configured?: boolean }).configured ? ["new-relic"] : [], ...body } });

test.describe("/performance states", () => {
  test("no keys configured: setup prompt linking to /setup, no numbers", async ({ page }) => {
    await metrics(page, { configured: false, pages: [] });
    await page.goto("/performance");
    await expect(page.locator('a[href="/setup"]').first()).toBeVisible(); // wording may change; the link to /setup is the contract
    await expect(contains(page, /\b0ms\b|Healthy/)).toHaveCount(0);
  });

  test("configured but no pages: 'No data yet' linking to /connect", async ({ page }) => {
    await metrics(page, { configured: true, pages: [] });
    await page.goto("/performance");
    await expect(contains(page, "No data yet")).toBeVisible();
    await expect(page.locator('a[href="/connect"]').first()).toBeVisible();
  });

  test("pages that never reported show 'No data yet', not 0ms or Healthy", async ({ page }) => {
    await metrics(page, { configured: true, pages: [pageOf("quiet")] });
    await page.goto("/performance");
    await expect(contains(page, "No data yet")).toBeVisible();
    await expect(contains(page, /\b0ms\b|Healthy/)).toHaveCount(0);
  });

  test("API failure: one error banner, Retry refetches and recovers", async ({ page }) => {
    await metrics(page, { error: "FAKE upstream down" }, 500);
    await page.goto("/performance");
    await expect(contains(page, "Could not load metrics")).toBeVisible();
    await expect(contains(page, "FAKE upstream down")).toBeVisible();
    await metrics(page, { configured: true, pages: [pageOf("blog", { nr: { loadTime: 1200, throughput: 5 } })] });
    await contains(page, "button", "Retry").click();
    await expect(contains(page, "button", "Retry")).toHaveCount(0); // not the banner text: the header subtitle shows the same error and has its own fetch
    await expect(contains(page, "FAKE blog")).toBeVisible();
  });

  test("row click opens that page's detail", async ({ page }) => {
    await metrics(page, { configured: true, pages: [pageOf("blog", { nr: { loadTime: 1200, throughput: 5 } }), pageOf("docs", { nr: { loadTime: 700, throughput: 9 } })] });
    await page.goto("/performance");
    await contains(page, "FAKE docs").click();
    await expect(page).toHaveURL(/\/performance\/docs$/);
    await expect(contains(page, "FAKE docs")).toBeVisible();
    await expect(contains(page, "FAKE blog")).toHaveCount(0);
  });
});

// The breach banner is on home only (e2e/fix-first.spec.ts covers it in full). This is the old response shape.
test.describe("breach banner", () => {
  test("home: shows when a page breaches a threshold, names it, and Dismiss hides it; /performance has none", async ({ page }) => {
    await metrics(page, { configured: true, tools: ["new-relic"], pages: [pageOf("slow", { nr: { loadTime: 9000, throughput: 5 } })], history: [] }); // home reads history; the real route always sends it
    await stub(page, "GET", "/api/timings", { items: [] });
    await stub(page, "POST", "/api/analyze", { alerts: [], recommendations: [] });
    await page.goto("/");
    const alert = page.locator('[data-slot="alert"]');
    await expect(alert).toContainText("Critical · FAKE slow");
    await expect(alert).toContainText("1 page is over a limit");
    await contains(page, '[data-slot="banner-actions"] button', "Dismiss").click();
    await expect(alert).toHaveCount(0);

    await page.goto("/performance");
    await expect(page.locator('tbody tr[data-slug="slow"] [data-slot="badge"]')).toHaveAttribute("data-status", "Critical");
    await expect(alert).toHaveCount(0);
  });
});

test.describe("/performance/[slug]", () => {
  test("unknown slug gives not-found", async ({ page }) => {
    await metrics(page, { configured: true, pages: [pageOf("blog", { nr: { loadTime: 1, throughput: 1 } })] });
    await page.goto("/performance/nope");
    await expect(contains(page, /404|not found/i)).toBeVisible();
  });

  test("known page with no data: empty state naming the page", async ({ page }) => {
    await metrics(page, { configured: true, pages: [pageOf("quiet")] });
    await page.goto("/performance/quiet");
    await expect(contains(page, "FAKE quiet")).toBeVisible(); // names the page
    await expect(page.locator('a[href="/connect"]').first()).toBeVisible();
    await expect(contains(page, /\b0ms\b|Healthy/)).toHaveCount(0);
  });

  test("detail error: banner with Retry", async ({ page }) => {
    await metrics(page, { error: "FAKE boom" }, 500);
    await page.goto("/performance/blog");
    await expect(contains(page, "Could not load metrics")).toBeVisible();
    await expect(contains(page, "button", "Retry")).toBeVisible();
  });
});
