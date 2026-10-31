import { expect, test, type Page } from "@playwright/test";
import { contains, stub } from "./helpers";

// C1 (capability mapping) changes nothing on screen. One visit per key set, with the API stubbed (FAKE fixtures only),
// naming the headings, column headers and tiles each screen had before. The bodies carry the old per-vendor fields and
// the new neutral ones, so this same spec also passes on the code before C1.
const at = "2026-01-01T00:00:00.000Z";
const nr = { loadTime: 1200, lcp: 2100, ttfb: 400, cls: 0.05, inp: 180, fid: 20, errorRate: 0.2, throughput: 40, apdexScore: 0.95 };
const latest = [{ title: "FAKE TypeError: x is undefined", count: 2, lastSeen: at }];
const nrMetrics = { traffic: { count: 40 }, loadTime: 1200, apdex: 0.95, vitals: { lcp: 2100, cls: 0.05, inp: 180, ttfb: 400, fid: 20 }, errorRate: 0.2 };
const errors = { count: 2, latest };
const NR_SOURCES = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic" };

const setup = async (page: Page, tools: string[]) => {
  const hasNr = tools.includes("new-relic");
  const hasSentry = tools.includes("sentry");
  const pageRow = {
    name: "FAKE Blog", slug: "blog", url: "/blog", visitors: "40", status: "Healthy", recordedAt: at,
    newRelic: nr,
    ...(hasSentry ? { sentry: { errorCount: 2, errorRate: 0, warningCount: 0, latestErrors: latest } } : {}),
    metrics: { ...nrMetrics, ...(hasSentry ? { errors } : {}) },
    byTool: { "new-relic": nrMetrics, ...(hasSentry ? { sentry: { errors } } : {}) },
  };
  // Beside New Relic, Sentry supplies only errors. Alone, it lists the pages and supplies sampled traffic and vitals too.
  const sources = { ...(hasNr ? NR_SOURCES : hasSentry ? { pages: "sentry", traffic: "sentry", vitals: "sentry" } : {}), ...(hasSentry ? { errors: "sentry" } : {}) };
  const pages = hasNr ? [pageRow] : []; // Sentry-only here has sent nothing yet (e2e/sentry-only.spec.ts covers it with data)
  await page.setViewportSize({ width: 1440, height: 900 }); // sidebar labels and the header subtitle are hidden at narrower widths
  await stub(page, "GET", "/api/setup", { configured: true, tools, keys: {} });
  await stub(page, "GET", "/api/metrics", { configured: true, tools, failed: [], sources, project: "fake-project", pages, history: pages.length ? [{ timestamp: at, sources, pages }] : [] });
  await stub(page, "GET", "/api/timings", { items: [] });
  await stub(page, "POST", "/api/analyze", { alerts: [], recommendations: [] });
};

const headers = (page: Page, expected: string[]) =>
  expect.poll(() => page.locator("thead th").evaluateAll((th) => th.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()))).toEqual(expected);
/** A row of the page table: the page's name (its link's title), then each cell as shown at 1440. */
const pageRow = (page: Page, slug: string, expected: string[]) =>
  expect.poll(() => page.locator(`tbody tr[data-slug="${slug}"]`).evaluateAll((trs) =>
    trs.length ? [trs[0].querySelector("th a")?.getAttribute("title"), ...[...trs[0].querySelectorAll("td")].map((td) => (td as HTMLElement).innerText.trim())] : null)).toEqual(expected);
const shows = async (page: Page, ...texts: string[]) => { for (const t of texts) await expect(contains(page, t)).toBeVisible(); };
const absent = async (page: Page, ...texts: string[]) => { for (const t of texts) await expect(contains(page, t)).toHaveCount(0); };

const HOME = ["Avg Page Load Time", "Error Rate", "Page views (24h)", "Apdex Score", "TTFB", "LCP", "CLS", "Apdex Trend", "Avg Apdex (x100)", "Pages with Apdex 0.9 or higher", "Pages Within Load Budget"];
const NR_TAB = ["Page Name", "Path", "Load", "LCP", "TTFB", "CLS", "INP", "Error Rate", "Throughput", "Apdex"];

test.describe("both tools connected", () => {
  test.beforeEach(({ page }) => setup(page, ["new-relic", "sentry"]));

  test("home, hub, detail and both tool tabs show what they showed before", async ({ page }) => {
    await page.goto("/");
    await shows(page, ...HOME);
    // The values: in the "Fix first" table (at 1440 the small-screen line holding the same numbers is hidden).
    await pageRow(page, "blog", ["FAKE Blog", "Healthy", "1.2s", "0.20%", "0.95", "2", "40"]);
    // The raw 24h count (one page, traffic.count 40), not a rate. Read from its own tile: "40" alone also matches the header.
    const views = contains(page, "Page views (24h)").locator("xpath=..");
    await expect(views).toContainText("40");
    await expect(views).not.toContainText("k/s");
    await expect(contains(page, "header p", "1 of 1 pages reporting · 40 views in 24h · 2 open errors")).toBeVisible();

    await page.goto("/performance");
    await shows(page, "Pages Reporting", "1 of 1", "Avg Load Time", "Open Errors");
    await headers(page, ["Page", "Status", "Load time limit 1.5s", "Error rate limit 2%", "Apdex min 0.9", "Sentry errors last 24h, no limit", "Views (24h)"]);
    await pageRow(page, "blog", ["FAKE Blog", "Healthy", "1.2s", "0.20%", "0.95", "2", "40"]);
    await expect(page.locator('[data-slot="alert"]')).toHaveCount(0);

    await page.goto("/performance/blog");
    await shows(page, "Average Load Time", "Error Rate", "0.20%", "Traffic Volume", "Related Errors", "FAKE TypeError: x is undefined");

    await page.goto("/tools/new-relic");
    await shows(page, "Avg Load Time", "Avg LCP", "Avg TTFB", "Avg Apdex", "New Relic by Page");
    await headers(page, NR_TAB);

    await page.goto("/tools/sentry");
    await shows(page, "Total Errors", "Pages With Errors", "1 of 1", "Noisiest Page", "Sentry by Page");
    // The tab also shows Sentry's own page loads and vitals, from tracing.
    await headers(page, ["Page Name", "Path", "Errors", "Latest Error", "Last Seen", "Page loads (sampled)", "LCP", "TTFB", "CLS", "INP"]);
  });
});

test.describe("New Relic keys only", () => {
  test.beforeEach(({ page }) => setup(page, ["new-relic"]));

  test("the same screens without the error parts", async ({ page }) => {
    await page.goto("/");
    await shows(page, ...HOME);
    await expect(contains(page, "header p", "1 of 1 pages reporting · 40 views in 24h")).toBeVisible();
    await expect(contains(page, "header p", "1 of 1 pages reporting · 40 views in 24h")).not.toContainText("error");

    await page.goto("/performance");
    await shows(page, "Pages Reporting", "Avg Load Time");
    await absent(page, "Open Errors");
    await headers(page, ["Page", "Status", "Load time limit 1.5s", "Error rate limit 2%", "Apdex min 0.9", "Views (24h)"]);
    await pageRow(page, "blog", ["FAKE Blog", "Healthy", "1.2s", "0.20%", "0.95", "40"]);

    await page.goto("/performance/blog");
    await shows(page, "Average Load Time", "Error Rate", "Traffic Volume");
    await absent(page, "Related Errors");

    await page.goto("/tools/new-relic");
    await headers(page, NR_TAB);
  });
});

test.describe("Sentry keys only", () => {
  test.beforeEach(({ page }) => setup(page, ["sentry"]));

  test("nothing sent yet → every screen says 'No data yet' and points to Connect, with no zeros", async ({ page }) => {
    for (const path of ["/", "/performance", "/performance/blog", "/tools/sentry"]) {
      await page.goto(path);
      await shows(page, "No data yet");
      await expect(page.locator('a[href="/connect"]').first()).toBeVisible();
      // Sentry lists pages itself now, so nothing asks for New Relic keys.
      // "0ms" stays: it is formatDuration(0), what a tile or table cell drawn from no data would read (not only the old vitals delta).
      await absent(page, "Sentry is connected", "Add New Relic keys", "0ms", "Healthy", "Avg Load Time", "Avg Page Load Time", "Page views (24h)");
      await expect(page.locator("thead")).toHaveCount(0);
    }
  });
});
