import { expect, test, type Page } from "@playwright/test";
import { contains, noSideScroll, stub } from "./helpers";

// Piece 3: the "Fix first" page table and the inline breach banner on home. The API is stubbed (FAKE fixtures only),
// /api/settings included, so the run never reads or writes a real settings file.
const at = "2026-01-01T00:00:00.000Z";
const SOURCES = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic", errors: "sentry" };
const DEFAULTS = { loadSeconds: 1.5, errorPercent: 2, apdexMin: 0.9, uptimeSLA: 99.9 };
const VITALS = { lcp: 2100, cls: 0.05, inp: 180, ttfb: 400, fid: 20 };

type PageRow = { name: string; slug: string; url: string; visitors: string; status: string; recordedAt: string; metrics: object; byTool: object };
// The status sent is deliberately wrong: the screen must judge the numbers itself.
const raw = (slug: string, metrics: object, visitors = "40"): PageRow =>
  ({ name: `FAKE ${slug}`, slug, url: `/${slug}`, visitors, status: "Healthy", recordedAt: at, metrics, byTool: { "new-relic": metrics } });
/** A measured page; the defaults are inside every default limit (1.5s, 2%, Apdex 0.9). */
const pg = (slug: string, m: { loadTime?: number; errorRate?: number; apdex?: number; views?: number; errors?: number } = {}) => {
  const { views = 40, errors = 0, ...perf } = m;
  return raw(slug, { traffic: { count: views }, vitals: VITALS, loadTime: 300, errorRate: 0.1, apdex: 1, ...perf, errors: { count: errors, latest: [] } }, String(views));
};
const CRIT = pg("crit", { loadTime: 3100, errorRate: 4.2, apdex: 0.85, errors: 9 });
const OK = pg("ok");

const open = async (page: Page, path: string, pages: PageRow[], width = 1440, height = 900) => {
  await page.setViewportSize({ width, height });
  await stub(page, "GET", "/api/setup", { configured: true, tools: ["new-relic", "sentry"], keys: {} });
  await stub(page, "GET", "/api/metrics", { configured: true, tools: ["new-relic", "sentry"], failed: [], sources: SOURCES, project: "fake-project", pages, history: [{ timestamp: at, sources: SOURCES, pages }], timestamp: at });
  await stub(page, "GET", "/api/timings", { items: [] });
  await stub(page, "POST", "/api/analyze", { alerts: [], recommendations: [] });
  await stub(page, "GET", "/api/settings", DEFAULTS);
  await page.goto(path);
};

const banner = (page: Page) => page.locator('[data-slot="alert"]');
const row = (page: Page, slug: string) => page.locator(`tbody tr[data-slug="${slug}"]`);
/** The FULL list of rows, in order: rendered rows first, so an absence checked after this means something. */
const rowsAre = (page: Page, expected: string[]) =>
  expect.poll(() => page.locator("tbody tr[data-slug]").evaluateAll((trs) => trs.map((tr) => tr.getAttribute("data-slug")))).toEqual(expected);

test("rows are ranked worst first, whatever order the pages arrive in", async ({ page }) => {
  // Critical, Warning, errors with no status, Healthy (closest to a limit first), no data. Equal ratios fall to Sentry errors, then traffic.
  const ranked = [
    pg("c-ratio", { loadTime: 4500 }), // Critical, ratio 3: beats the larger error counts below
    pg("c-errors", { loadTime: 3600, errors: 9, views: 10 }), // ratio 2.4 from here
    pg("c-traffic", { loadTime: 3600, errors: 5, views: 90 }),
    pg("c-name", { loadTime: 3600, errors: 5, views: 20 }),
    pg("warn", { apdex: 0.85, errors: 50 }),
    raw("np", { errors: { count: 3, latest: [] } }, "0"),
    pg("healthy-close", { loadTime: 1400 }),
    pg("healthy-far", { errors: 7 }),
    raw("quiet", { loadTime: 0, errorRate: 0, apdex: 0, traffic: { count: 0 } }, "0"),
  ];
  await open(page, "/performance", [...ranked].reverse());
  await rowsAre(page, ranked.map((p) => p.slug));
  await expect(row(page, "c-ratio").locator('[data-slot="badge"]')).toHaveAttribute("data-status", "Critical");
  await expect(row(page, "quiet").locator('[data-slot="badge"]')).toHaveAttribute("data-status", "No data yet");
});

test("a breaching page → the banner on home, naming the page, its values and limits; none on /performance", async ({ page }) => {
  await open(page, "/", [OK, CRIT]);
  await rowsAre(page, ["crit", "ok"]);
  await expect(banner(page)).toBeVisible();
  await expect(banner(page)).toHaveAttribute("role", "region");
  await expect(banner(page)).toHaveAttribute("aria-label", "Pages over a limit");
  await expect(banner(page).locator('[data-slot="banner-title"]')).toHaveText("1 page is over a limit");
  await expect(banner(page).locator('li[data-slug="crit"] > span')).toHaveText("Critical · FAKE crit: error rate 4.20% (limit 2%), load time 3.1s (limit 1.5s), Apdex 0.85 (min 0.9)");
  await expect(banner(page).locator('li[data-slug="crit"] a')).toHaveAttribute("href", "/performance/crit");
  await expect(banner(page)).not.toContainText(/adjust|loosen|threshold exceeded/i);

  await page.goto("/performance");
  await rowsAre(page, ["crit", "ok"]);
  await expect(row(page, "crit").locator('[data-slot="badge"]')).toHaveAttribute("data-status", "Critical"); // the same breach, judged here too
  await expect(banner(page)).toHaveCount(0);
});

test("Dismiss hides the banner, moves focus to the table heading, and it stays hidden after a reload", async ({ page }) => {
  await open(page, "/", [CRIT, OK]);
  await rowsAre(page, ["crit", "ok"]);
  await expect(banner(page)).toBeVisible();
  await contains(page, '[data-slot="banner-actions"] button', "Dismiss").click();
  await expect(banner(page)).toHaveCount(0);
  await expect(page.locator(":focus")).toHaveId("pages-table-title");
  await expect(page.locator(":focus")).toHaveText("Fix first");

  await page.reload();
  await rowsAre(page, ["crit", "ok"]);
  await expect(row(page, "crit").locator('[data-slot="badge"]')).toHaveAttribute("data-status", "Critical");
  await expect(banner(page)).toHaveCount(0);
});

test("the real zero-row shape (Sentry errors, no New Relic row) → 'No performance data' and dashes, never a breach", async ({ page }) => {
  // What the route sends for a page New Relic has no row for: zeros, not missing fields. Apdex 0 must not read as a breach.
  const zero = raw("zero", { loadTime: 0, errorRate: 0, apdex: 0, traffic: { count: 0 }, vitals: { lcp: 0, cls: 0, inp: 0, ttfb: 0, fid: 0 }, errors: { count: 3, latest: [] } }, "0");
  await open(page, "/", [OK, zero, CRIT]);
  await rowsAre(page, ["crit", "zero", "ok"]); // after the breach, above Healthy
  await expect(row(page, "zero").locator('[data-slot="badge"]')).toHaveAttribute("data-status", "No performance data");
  await expect.poll(() => row(page, "zero").locator("td").evaluateAll((tds) => ({
    cells: tds.slice(1, 4).map((td) => (td as HTMLElement).innerText.trim()), // load time, error rate, Apdex
    errors: (tds[4] as HTMLElement | undefined)?.innerText.trim(), // Sentry errors
  }))).toEqual({ cells: ["—", "—", "—"], errors: "3" });
  await expect(row(page, "zero").locator("[data-over-limit]")).toHaveCount(0);
  await expect(banner(page).locator("li")).toHaveCount(1);
  await expect(banner(page).locator("li")).toHaveAttribute("data-slug", "crit");
});

test.describe("390px wide", () => {
  for (const path of ["/", "/performance"]) {
    test(`${path} → no horizontal page scroll, with a breaching row showing its reason line`, async ({ page }) => {
      await open(page, path, [OK, CRIT, pg("warn", { loadTime: 2000 })], 390, 844);
      await rowsAre(page, ["crit", "warn", "ok"]);
      await expect(row(page, "crit").locator('[data-slot="row-summary"]')).toBeVisible();
      await expect(row(page, "crit").locator('[data-slot="row-summary"]')).toContainText("Error rate 4.20% (limit 2%)");
      await noSideScroll(page, path);
    });
  }
});
