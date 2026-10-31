import { expect, test, type Page } from "@playwright/test";
import { contains, noSideScroll, stub } from "./helpers";

// Piece 4: no dead controls, named icon-only controls, card headings, no sideways scroll, header readable on mobile.
// The API is stubbed (FAKE fixtures only), as in fix-first.spec.ts.
const at = "2026-01-01T00:00:00.000Z";
const SOURCES = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic", errors: "sentry" };
const VITALS = { lcp: 2100, cls: 0.05, inp: 180, ttfb: 400, fid: 20 };
const metrics = { traffic: { count: 40 }, vitals: VITALS, loadTime: 300, errorRate: 0.1, apdex: 1, errors: { count: 2, latest: [] } };
const PAGES = [{ name: "FAKE home", slug: "home", url: "/home", visitors: "40", status: "Healthy", recordedAt: at, metrics, byTool: { "new-relic": metrics } }];

const open = async (page: Page, path: string, width = 1440, height = 900) => {
  await page.setViewportSize({ width, height });
  await stub(page, "GET", "/api/setup", { configured: true, tools: ["new-relic", "sentry"], keys: {} });
  await stub(page, "GET", "/api/metrics", { configured: true, tools: ["new-relic", "sentry"], failed: [], sources: SOURCES, project: "fake-project-with-a-rather-long-name", pages: PAGES, history: [{ timestamp: at, sources: SOURCES, pages: PAGES }], timestamp: at });
  await stub(page, "GET", "/api/timings", { items: [] });
  await stub(page, "POST", "/api/analyze", { alerts: [], recommendations: [] });
  await stub(page, "GET", "/api/settings", { loadSeconds: 1.5, errorPercent: 2, apdexMin: 0.9, uptimeSLA: 99.9 });
  await page.goto(path);
};

test("home has no range toggle and no notification bell", async ({ page }) => {
  await open(page, "/");
  await expect(contains(page, "h3", "TTFB")).toBeAttached();
  for (const t of ["1D", "7D", "30D"]) await expect(contains(page, "button", new RegExp(`^${t}$`))).toHaveCount(0);
  await expect(page.locator('[aria-label*="otification" i]')).toHaveCount(0);
});

test("every link and button in the sidebar and header has an accessible name", async ({ page }) => {
  await open(page, "/");
  await expect(page.locator("header h1:visible").first()).toBeVisible();
  const controls = page.locator('[data-slot="sidebar"] a, [data-slot="sidebar"] button, header a, header button');
  await expect.poll(() => controls.evaluateAll((els) => ({
    found: els.length > 0,
    unnamed: els.filter((el) => {
      const labelledby = el.getAttribute("aria-labelledby");
      const byId = labelledby ? document.getElementById(labelledby)?.textContent : "";
      return (el.getAttribute("aria-label") || byId || el.textContent || "").trim() === "";
    }).map((el) => el.outerHTML.slice(0, 80)),
  }))).toEqual({ found: true, unnamed: [] });
});

test("card titles are headings", async ({ page }) => {
  await open(page, "/");
  await expect.poll(() => page.locator("h3").count()).toBeGreaterThanOrEqual(3);
});

test.describe("no horizontal page scroll", () => {
  for (const width of [390, 768, 800, 1440]) {
    for (const path of ["/", "/performance"]) {
      test(`${path} at ${width}px`, async ({ page }) => {
        await open(page, path, width);
        await expect(page.locator("header h1:visible").first()).toBeVisible();
        await expect(page.locator("h2").first()).toBeAttached();
        await noSideScroll(page);
      });
    }
  }
});

test("at 390px the header shows the project name and the status line", async ({ page }) => {
  await open(page, "/", 390, 844);
  await expect(page.locator("header h1:visible").first()).toBeVisible();
  await expect(page.locator("header h1:visible").first()).toContainText("fake-project");
  await expect(contains(page, "header p", "1 of 1 pages reporting")).toBeVisible();
  await expect(contains(page, "header p", "1 of 1 pages reporting")).toContainText("updated");
});
