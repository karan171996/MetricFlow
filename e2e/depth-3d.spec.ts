import { expect, test, type Locator, type Page } from "@playwright/test";
import { contains, noSideScroll, stub } from "./helpers";

// The 3D look of the whole dashboard (app/globals.css under html:not([data-depth="off"]), set by
// components/Depth3D.tsx): on by default, and off for reduced motion, a stored "off", or the Settings switch.
// The browser is told what it is before the page loads; FAKE data only, the API is stubbed.
const at = "2026-01-01T00:00:00.000Z";
const sources = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic" };
const DEFAULTS = { loadSeconds: 1.5, errorPercent: 2, apdexMin: 0.9, uptimeSLA: 99.9 };

const pageOf = (slug: string, loadTime: number) => {
  const metrics = { loadTime, traffic: { count: 400 }, vitals: { lcp: 2100, cls: 0.05, inp: 180, ttfb: 400, fid: 20 }, errorRate: 0.5, apdex: 0.95 };
  return { name: `FAKE ${slug}`, slug, url: `/${slug}`, visitors: "400", status: "Healthy", recordedAt: at, metrics, byTool: { "new-relic": metrics } };
};

type Env = { reduced?: boolean; stored?: "0" | "1"; width?: number; pages?: ReturnType<typeof pageOf>[]; path?: string };

const visit = async (page: Page, env: Env = {}) => {
  const pages = env.pages ?? [pageOf("home", 900), pageOf("pricing", 3400), pageOf("blog", 1700)];
  await page.setViewportSize({ width: env.width ?? 1440, height: 900 });
  await stub(page, "GET", "/api/setup", { configured: true, tools: ["new-relic"], keys: {} });
  await stub(page, "GET", "/api/metrics", { configured: true, tools: ["new-relic"], failed: [], sources, project: "fake-project", pages, history: [{ timestamp: at, sources, pages }] });
  await stub(page, "GET", "/api/timings", { items: [] });
  await stub(page, "POST", "/api/analyze", { alerts: [], recommendations: [] });
  const settings = await stub(page, "GET", "/api/settings", DEFAULTS);
  await page.addInitScript(({ reduced, stored }) => {
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 8, configurable: true });
    const real = window.matchMedia.bind(window);
    window.matchMedia = ((q: string) => {
      const list = real(q);
      if (/prefers-reduced-motion/.test(q)) Object.defineProperty(list, "matches", { value: Boolean(reduced), configurable: true });
      return list;
    }) as typeof window.matchMedia;
    if (stored) localStorage.setItem("metricflow:3d", stored);
  }, { reduced: env.reduced, stored: env.stored });
  await page.goto(env.path ?? "/");
  await settings.wait();
};

const depth = (page: Page) => page.locator("html");
const backdrop = (l: Locator) => l.evaluate((el) => getComputedStyle(el).backdropFilter || getComputedStyle(el).getPropertyValue("-webkit-backdrop-filter"));
const shadow = (l: Locator) => l.evaluate((el) => getComputedStyle(el).boxShadow);
const bodyBefore = (page: Page) => page.evaluate(() => { const s = getComputedStyle(document.body, "::before"); return { position: s.position, pointerEvents: s.pointerEvents }; });
const fix = (page: Page) => contains(page, "h2", "Fix first");

test.describe("The 3D look of the whole dashboard", () => {
  test("is on by default: panels are glass with depth, and the scene has a floor", async ({ page }) => {
    await visit(page);
    await expect(fix(page)).toBeVisible();
    await expect(depth(page)).toHaveAttribute("data-depth", "3d");
    await expect.poll(() => backdrop(page.locator('[data-slot="card"]').first())).toContain("blur");
    await expect.poll(() => backdrop(page.locator('[data-slot="stat-tile"]').first())).toContain("blur");
    expect(await bodyBefore(page)).toEqual({ position: "fixed", pointerEvents: "none" });
  });

  test("a card's glare follows the pointer", async ({ page }) => {
    await visit(page);
    const tile = page.locator('[data-slot="stat-tile"]').first();
    await tile.hover({ position: { x: 14, y: 14 } });
    await expect.poll(() => tile.evaluate((el) => parseFloat((el as HTMLElement).style.getPropertyValue("--glare-x")))).toBeLessThan(10);
  });

  test("controls get depth too, and lose it with 3D off", async ({ page }) => {
    await visit(page, { path: "/settings" });
    await expect.poll(() => shadow(page.locator('[data-slot="tabs-list"]'))).toContain("inset");
    await expect.poll(() => shadow(page.locator('[data-slot="tabs-trigger"][data-active]'))).toContain("rgba");
    await visit(page, { path: "/settings", stored: "0" });
    await expect.poll(() => shadow(page.locator('[data-slot="tabs-list"]'))).toBe("none");
  });

  test("every KPI tile carries its judged status, and only a Warning or Critical one glows", async ({ page }) => {
    await visit(page, { pages: [pageOf("a", 3400), pageOf("b", 4000)] }); // average load 3.7s: well over twice the 1.5s limit
    await expect.poll(() => page.locator('[data-slot="stat-tile"]').count()).toBeGreaterThanOrEqual(3);
    await expect(contains(page, '[data-slot="stat-tile"]', "Avg Page Load Time")).toHaveAttribute("data-status", "Critical");
    await expect(contains(page, '[data-slot="stat-tile"]', "Page views")).toHaveAttribute("data-status", "none");
  });

  test("is off, and the page is flat, when the system asks for reduced motion", async ({ page }) => {
    await visit(page, { reduced: true });
    await expect(fix(page)).toBeVisible();
    await expect(depth(page)).toHaveAttribute("data-depth", "off");
    await expect.poll(() => backdrop(page.locator('[data-slot="card"]').first())).toMatch(/^(none)?$/);
    expect((await bodyBefore(page)).position).not.toBe("fixed");
  });

  test("is off when the user turned it off, and the Settings switch changes it live", async ({ page }) => {
    await visit(page, { stored: "0", path: "/settings" });
    await expect(depth(page)).toHaveAttribute("data-depth", "off");
    const sw = page.locator('[role="switch"][aria-label="3D views"]');
    await sw.click();
    await expect(depth(page)).toHaveAttribute("data-depth", "3d");
    await sw.click();
    await expect(depth(page)).toHaveAttribute("data-depth", "off");
  });

  test("does not make the page scroll sideways, on a desktop or a phone", async ({ page }) => {
    for (const width of [1440, 390]) {
      await visit(page, { width });
      await expect(fix(page)).toBeAttached();
      await noSideScroll(page, `width ${width}`);
    }
  });
});
