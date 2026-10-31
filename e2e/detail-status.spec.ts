import { expect, test, type Page } from "@playwright/test";
import { contains, noSideScroll, stub } from "./helpers";

// The page detail view: status badge, the reason sentence, and the limits on the KPI cards. The API is stubbed (FAKE fixtures only),
// /api/settings included, so the run never reads or writes a real settings file.
const at = "2026-01-01T00:00:00.000Z";
const NR = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic", errors: "sentry" };
const SENTRY = { pages: "sentry", traffic: "sentry", vitals: "sentry", errors: "sentry" };
const DEFAULTS = { loadSeconds: 1.5, errorPercent: 2, apdexMin: 0.9, uptimeSLA: 99.9 };

type PageRow = { name: string; slug: string; url: string; visitors: string; status: string; recordedAt: string; metrics: object; byTool: object };
// The status sent is deliberately wrong: the screen must judge the numbers itself.
const raw = (slug: string, metrics: object, visitors = "40"): PageRow =>
  ({ name: `FAKE ${slug}`, slug, url: `/${slug}`, visitors, status: "Healthy", recordedAt: at, metrics, byTool: { "new-relic": metrics } });
const pg = (slug: string, m: { loadTime?: number; errorRate?: number; apdex?: number } = {}) =>
  raw(slug, { traffic: { count: 40 }, loadTime: 300, errorRate: 0.1, apdex: 1, ...m, errors: { count: 2, latest: [] } });

const open = async (page: Page, path: string, pages: PageRow[], opts: { tools?: string[]; sources?: object; width?: number } = {}) => {
  const { tools = ["new-relic", "sentry"], sources = NR, width = 1440 } = opts;
  await page.setViewportSize({ width, height: 900 });
  await stub(page, "GET", "/api/setup", { configured: true, tools, keys: {} });
  await stub(page, "GET", "/api/metrics", { configured: true, tools, failed: [], sources, project: "fake-project", pages, history: [{ timestamp: at, sources, pages }], timestamp: at });
  await stub(page, "GET", "/api/timings", { items: [] });
  await stub(page, "POST", "/api/analyze", { alerts: [], recommendations: [] });
  await stub(page, "GET", "/api/settings", DEFAULTS);
  await page.goto(path);
};
const block = (page: Page) => page.locator('section[aria-labelledby="page-status-title"]');
const card = (page: Page, label: string) => contains(page, '[data-slot="card"]', label);

test("a Critical page → the badge, the reasons, and each limit on its KPI card", async ({ page }) => {
  await open(page, "/performance/crit", [pg("crit", { loadTime: 3100, errorRate: 4.2, apdex: 0.85 })]);
  await expect(block(page).locator('[data-slot="badge"]')).toHaveAttribute("data-status", "Critical");
  await expect(block(page).locator("h2")).toHaveText("Status");
  await expect(block(page).locator('[data-slot="status-sentence"]')).toHaveText("Over a limit: error rate 4.20% (limit 2%), load time 3.1s (limit 1.5s), Apdex 0.85 (min 0.9).");
  await expect(contains(block(page), "a", "Edit limits")).toHaveAttribute("href", "/settings?tab=thresholds");
  await expect(card(page, "Average Load Time")).toContainText("limit 1.5s");
  await expect(card(page, "Average Load Time").locator("[data-over-limit]")).toContainText("3.1s");
  await expect(card(page, "Average Load Time").locator("[data-over-limit]")).toContainText("over limit");
  await expect(card(page, "Error Rate")).toContainText("limit 2%");
  await expect(card(page, "Error Rate").locator("[data-over-limit]")).toContainText("over limit");
  await expect(card(page, "Apdex")).toContainText("min 0.9");
  await expect(card(page, "Apdex").locator("[data-over-limit]")).toContainText("over limit");
  await expect(card(page, "Traffic Volume").locator("[data-over-limit]")).toHaveCount(0);
});

test("a healthy page → 'Within your limits.' and no over-limit marks", async ({ page }) => {
  await open(page, "/performance/ok", [pg("ok")]);
  await expect(block(page).locator('[data-slot="badge"]')).toHaveAttribute("data-status", "Healthy");
  await expect(block(page).locator('[data-slot="status-sentence"]')).toHaveText("Within your limits.");
  await expect(card(page, "Average Load Time")).toContainText("limit 1.5s");
  await expect(card(page, "Average Load Time")).toContainText("300ms");
  await expect(page.locator("[data-over-limit]")).toHaveCount(0);
});

test("the zero-row page (Sentry errors, no New Relic row) → 'No performance data', dashes, no breach", async ({ page }) => {
  const zero = raw("zero", { loadTime: 0, errorRate: 0, apdex: 0, traffic: { count: 0 }, errors: { count: 3, latest: [] } }, "0");
  await open(page, "/performance/zero", [zero]);
  await expect(block(page).locator('[data-slot="badge"]')).toHaveAttribute("data-status", "No performance data");
  await expect(block(page).locator('[data-slot="status-sentence"]')).toHaveText("No performance data from New Relic for this page yet.");
  await expect(card(page, "Average Load Time")).toContainText("—");
  await expect(card(page, "Average Load Time")).not.toContainText("0ms");
  await expect(page.locator("[data-over-limit]")).toHaveCount(0);
  await expect(contains(page, /Warning|Critical|Healthy/)).toHaveCount(0);
});

test("a Sentry-only page → no performance cards and no performance limits", async ({ page }) => {
  const p = raw("blog", { traffic: { count: 9 }, errors: { count: 2, latest: [] } }, "9");
  await open(page, "/performance/blog", [p], { tools: ["sentry"], sources: SENTRY });
  await expect(block(page).locator('[data-slot="badge"]')).toHaveAttribute("data-status", "No performance data");
  await expect(contains(page, "Related Errors")).toBeVisible();
  await expect(contains(page, /limit 1\.5s|limit 2%|min 0\.9|Average Load Time|Error Rate|Apdex/)).toHaveCount(0);
});

test("390px wide → no horizontal page scroll", async ({ page }) => {
  await open(page, "/performance/crit", [pg("crit", { loadTime: 3100, errorRate: 4.2, apdex: 0.85 })], { width: 390 });
  await expect(block(page)).toBeAttached();
  await noSideScroll(page);
});
