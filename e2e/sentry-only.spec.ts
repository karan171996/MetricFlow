import { expect, test, type Page } from "@playwright/test";
import { contains, stub } from "./helpers";

// Sentry keys only, with a site that sends traces: Sentry lists the pages itself and supplies sampled
// page loads, web vitals and errors. Nothing New Relic-only (load time, Apdex, status) may appear, a sampled
// count is always labelled as sampled, and a value nobody measured is "—", never 0.
// The API is stubbed (FAKE fixtures only) in the shape /api/metrics sends.
const at = "2026-01-01T00:00:00.000Z";
const SOURCES = { pages: "sentry", traffic: "sentry", vitals: "sentry", errors: "sentry" };
const latest = [{ title: "FAKE TypeError: x is undefined", count: 2, lastSeen: at }];

const pageOf = (name: string, url: string, visitors: string, metrics: object) => ({ name, slug: url.replace(/^\//, "").replace(/\//g, "-"), url, visitors, recordedAt: at, metrics, byTool: { sentry: metrics } });
const pages = [
  // Loaded nine times, with two errors. INP is absent: no interaction was recorded.
  pageOf("FAKE Blog", "/blog", "9", { traffic: { count: 9, sampled: true }, vitals: { lcp: 600, cls: 0.05, ttfb: 30 }, errors: { count: 2, latest } }),
  // Loaded, no errors and no CLS measured.
  pageOf("FAKE Docs", "/docs", "3", { traffic: { count: 3, sampled: true }, vitals: { lcp: 400, ttfb: 20 }, errors: { count: 0, latest: [] } }),
  // Errors only: no sampled load, so no traffic and no vitals.
  pageOf("FAKE Cart", "/cart", "0", { errors: { count: 7, latest: [{ title: "FAKE Error: z", count: 7, lastSeen: at }] } }),
];

const headers = (page: Page, expected: string[]) =>
  expect.poll(() => page.locator("thead th").evaluateAll((th) => th.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()))).toEqual(expected);
// The Page cell reads as its link's title (the name); the path and a hidden ", view page details" are in it too.
const row = (page: Page, i: number, expected: string[]) =>
  expect.poll(() => page.locator("tbody tr").evaluateAll((trs, i) => [...(trs[i]?.children ?? [])].map((td) => td.querySelector("a[title]")?.getAttribute("title") ?? (td as HTMLElement).innerText.trim()), i)).toEqual(expected);
const cells = (page: Page, i: number) =>
  page.locator("tbody tr").evaluateAll((trs, i) => [...(trs[i]?.children ?? [])].map((td) => (td as HTMLElement).innerText.trim()), i);
const shows = async (page: Page, ...texts: string[]) => { for (const t of texts) await expect(contains(page, t)).toBeVisible(); };
const absent = async (page: Page, ...texts: string[]) => { for (const t of texts) await expect(contains(page, t)).toHaveCount(0); };
const NEW_RELIC_ONLY = ["Avg Page Load Time", "Apdex", "Throughput", "Page views (24h)", "Avg Load Time", "Avg Load", "Healthy", "Warning", "Critical", "Visitors (24h)", "Traffic Volume", "Add New Relic keys"];

test.describe("Sentry keys only, site sending traces", () => {
  let metrics: Awaited<ReturnType<typeof stub>>;
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 }); // sidebar labels and the header subtitle are hidden at narrower widths
    await stub(page, "GET", "/api/setup", { configured: true, tools: ["sentry"], keys: {} });
    metrics = await stub(page, "GET", "/api/metrics", { configured: true, tools: ["sentry"], failed: [], sources: SOURCES, project: "fake-project", pages, history: [{ timestamp: at, sources: SOURCES, pages }] });
    await stub(page, "GET", "/api/timings", { items: [] });
    await stub(page, "POST", "/api/analyze", { alerts: [], recommendations: [] });
  });

  test("home → sampled page loads and web vitals, nothing that only New Relic measures", async ({ page }) => {
    await page.goto("/");
    await metrics.wait();
    await shows(page, "Sampled page loads (24h)", "TTFB", "LCP", "CLS");
    await expect(contains(page, "Sampled page loads (24h)").locator("xpath=..")).toContainText("12");
    await expect(contains(page, "header p", "3 of 3 pages reporting · 12 sampled page loads in 24h · 9 open errors")).toBeVisible();
    await absent(page, ...NEW_RELIC_ONLY, "views in 24h");
  });

  test("performance → pages listed from Sentry with a sampled column and no status", async ({ page }) => {
    await page.goto("/performance");
    await metrics.wait();
    await shows(page, "Pages Reporting", "3 of 3", "Open Errors");
    await headers(page, ["Page", "Sentry errors last 24h, no limit", "Page loads (sampled)"]);
    // Worst first: by Sentry errors, as nothing has a status.
    await row(page, 0, ["FAKE Cart", "7", "—"]); // errors only: no page load was sampled, so no number
    await row(page, 1, ["FAKE Blog", "2", "9"]);
    await row(page, 2, ["FAKE Docs", "0", "3"]);
    await expect.poll(() => page.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => tr.querySelector("th span[title]")?.textContent))).toEqual(["/cart", "/blog", "/docs"]);
    await expect(page.locator('[data-slot="alert"]')).toHaveCount(0); // no status, so nothing to alert on
    await absent(page, ...NEW_RELIC_ONLY);
  });

  test("page detail → sampled page loads and related errors only", async ({ page }) => {
    await page.goto("/performance/blog");
    await metrics.wait();
    await shows(page, "Page loads (sampled)", "Related Errors", "FAKE TypeError: x is undefined");
    await absent(page, "Average Load Time", "Error Rate", ...NEW_RELIC_ONLY);
  });

  test("Sentry tab → its own page loads and vitals, with a dash where nothing was measured", async ({ page }) => {
    await page.goto("/tools/sentry");
    await metrics.wait();
    await headers(page, ["Page Name", "Path", "Errors", "Latest Error", "Last Seen", "Page loads (sampled)", "LCP", "TTFB", "CLS", "INP"]);
    // Page loads, LCP, TTFB, CLS, INP are the last five cells.
    await expect.poll(async () => (await cells(page, 0)).slice(-5)).toEqual(["9", "600ms", "30ms", "0.05", "—"]);
    await expect.poll(async () => (await cells(page, 1)).slice(-5)).toEqual(["3", "400ms", "20ms", "—", "—"]);
    await expect.poll(async () => (await cells(page, 2)).slice(-5)).toEqual(["—", "—", "—", "—", "—"]);
    await expect.poll(async () => (await cells(page, 2)).slice(0, 4)).toEqual(["FAKE Cart", "/cart", "7", "FAKE Error: z"]);
  });
});
