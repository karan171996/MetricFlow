import { expect, test, type Page } from "@playwright/test";
import { contains, shot, stub } from "./helpers";

// Captures screenshots into test-results/screenshots/ only (never docs/images; Kelly owns those). Run: pnpm exec playwright test e2e/screenshots.spec.ts
// Every API the pages call is stubbed with fake sample data, so real New Relic/Sentry numbers never end up in a screenshot.
const PAGES = [
  ["Homepage", "home", "/", { loadTime: 900, lcp: 1400, ttfb: 180, cls: 0.05, inp: 120, errorRate: 0.3, throughput: 2400, apdexScore: 0.96 }, 3],
  ["Pricing", "pricing", "/pricing", { loadTime: 2400, lcp: 3100, ttfb: 420, cls: 0.12, inp: 310, errorRate: 1.0, throughput: 800, apdexScore: 0.84 }, 6],
  ["Blog", "blog", "/blog", { loadTime: 1500, lcp: 2100, ttfb: 300, cls: 0.1, inp: 180, errorRate: 3.0, throughput: 600, apdexScore: 0.9 }, 9],
  ["Docs", "docs", "/docs", { loadTime: 1100, lcp: 1600, ttfb: 210, cls: 0.02, inp: 90, errorRate: 0.1, throughput: 450, apdexScore: 0.95 }, 0],
  ["Checkout", "checkout", "/checkout", { loadTime: 1300, lcp: 1900, ttfb: 260, cls: 0.04, inp: 150, errorRate: 0.4, throughput: 250, apdexScore: 0.92 }, 1],
] as const;
const status = (nr: { loadTime: number; errorRate: number }) => (nr.loadTime > 2000 || nr.errorRate > 2 ? "Warning" : "Healthy");

// `drift` scales the numbers so older snapshots differ a little and the trend charts have a shape.
const pages = (drift: number, at: string) =>
  PAGES.map(([name, slug, url, nr, errors], i) => {
    const d = 1 + drift * (i % 2 ? 1 : -1);
    const m = { ...nr, fid: 0, loadTime: Math.round(nr.loadTime * d), lcp: Math.round(nr.lcp * d), ttfb: Math.round(nr.ttfb * d), apdexScore: Math.min(1, +(nr.apdexScore / d).toFixed(2)) };
    return {
      name, slug, url, visitors: String(nr.throughput), status: status(m), newRelic: m, recordedAt: at,
      sentry: { errorCount: errors, errorRate: 0, warningCount: 0, latestErrors: errors ? [{ title: "TypeError: Cannot read properties of undefined (reading 'items')", count: errors, lastSeen: at }] : [] },
    };
  });
const history = [0.12, 0.09, 0.07, 0.05, 0.03, 0].map((drift, i) => {
  const timestamp = `2026-10-03T14:${String(7 + i * 5).padStart(2, "0")}:00.000Z`;
  return { timestamp, pages: pages(drift, timestamp) };
});
const latest = history[history.length - 1];

test.describe("README screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await stub(page, "GET", "/api/metrics", { configured: true, tools: ["new-relic", "sentry"], project: "acme-storefront", pages: latest.pages, history, timestamp: latest.timestamp });
    await stub(page, "GET", "/api/timings", { items: [{ name: "New Relic: metrics", value: 412 }, { name: "Sentry: events", value: 268 }, { name: "New Relic: discover pages", value: 190 }] });
    await stub(page, "POST", "/api/analyze", {
      analysis: "Pricing is the slowest page and Blog has the most errors.",
      alerts: [
        { severity: "high", page: "Pricing", metric: "lcp", message: "LCP is 3.1s on Pricing. Preload the hero image and serve it as WebP." },
        { severity: "medium", page: "Blog", metric: "errorRate", message: "Error rate is 3.0% on Blog. Check the TypeError reported in Sentry." },
      ],
      recommendations: ["Lazy-load images below the fold on Blog.", "Cache the pricing API response at the edge."],
    });
  });

  for (const [path, name] of [["/", "dashboard"], ["/performance", "performance"]]) {
    test(`captures ${name}`, async ({ page }) => {
      await page.goto(path);
      await expect(contains(page, "acme-storefront")).toBeVisible();
      await page.waitForTimeout(2000); // let charts animate in
      await shot(page, name);
    });
  }
});

// The docs site's tour (docs/tour.md). Same rule: stubbed sample data only. Each capture waits for a piece of
// text that only shows once that screen has its data, then for the entrance animation to settle.
const SETTLE_MS = 1200;
const tour = async (page: Page, path: string, name: string, ready: string, scrollTo?: string) => {
  await page.goto(path);
  await expect(contains(page, ready)).toBeAttached();
  if (scrollTo) await contains(page, scrollTo).evaluate((el) => { el.scrollIntoView(); window.scrollBy(0, -24); });
  await page.waitForTimeout(SETTLE_MS); // titles and bars animate in; a capture mid-animation is half-drawn
  await shot(page, `tour-${name}`);
};

test.describe("docs tour screenshots: both tools", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await stub(page, "GET", "/api/setup", { configured: true, tools: ["new-relic", "sentry"], keys: { NEWRELIC_API_KEY: true, NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID: true, SENTRY_API_KEY: true, SENTRY_DSN: true } });
    await stub(page, "GET", "/api/metrics", { configured: true, tools: ["new-relic", "sentry"], project: "acme-storefront", pages: latest.pages, history, timestamp: latest.timestamp });
    await stub(page, "GET", "/api/timings", { items: [{ name: "New Relic: metrics", value: 412 }, { name: "Sentry: events", value: 268 }] });
    await stub(page, "POST", "/api/analyze", { alerts: [], recommendations: [] });
    const seen = (recent: number) => ({ recent, lastEventAt: latest.timestamp });
    await stub(page, "GET", "/api/connect", {
      configured: true, tools: ["new-relic", "sentry"], accountId: "1234567", insertKeySet: true,
      dsn: "https://0123456789abcdef0123456789abcdef@o123.ingest.sentry.io/456",
      browser: seen(128), ajax: seen(40), custom: seen(12), sentry: seen(3),
      setup: { appCount: 1, appName: "acme-storefront", applicationId: "111111111", browserKey: "NRJS-examplebrowserkey" },
    });
  });

  test("captures the page detail, both tool tabs, connect and setup", async ({ page }) => {
    await tour(page, "/performance/pricing", "page-detail", "Related Errors");
    await tour(page, "/tools/new-relic", "new-relic", "New Relic by Page");
    await tour(page, "/tools/sentry", "sentry", "Sentry by Page");
    await tour(page, "/connect", "connect", "Add MetricFlow to your site", "1. Add MetricFlow to your site");
    await tour(page, "/setup", "setup", "Sentry DSN");
  });
});

test.describe("docs tour screenshots: Sentry only", () => {
  // With only Sentry connected, pages, sampled page loads and web vitals come from Sentry's tracing data.
  const sources = { pages: "sentry", traffic: "sentry", vitals: "sentry", errors: "sentry" };
  const sentryPages = PAGES.map(([name, slug, url, nr, errors]) => {
    const metrics = {
      traffic: { count: Math.round(nr.throughput / 10), sampled: true },
      vitals: { lcp: nr.lcp, cls: nr.cls, ttfb: nr.ttfb },
      errors: { count: errors, latest: errors ? [{ title: "TypeError: Cannot read properties of undefined (reading 'items')", count: errors, lastSeen: latest.timestamp }] : [] },
    };
    return { name, slug, url, visitors: String(metrics.traffic.count), recordedAt: latest.timestamp, metrics, byTool: { sentry: metrics } };
  });

  test("captures the performance hub as a Sentry-only user sees it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await stub(page, "GET", "/api/setup", { configured: true, tools: ["sentry"], keys: { SENTRY_API_KEY: true, SENTRY_DSN: true } });
    await stub(page, "GET", "/api/metrics", { configured: true, tools: ["sentry"], failed: [], sources, project: "acme-storefront", pages: sentryPages, history: [{ timestamp: latest.timestamp, sources, pages: sentryPages }], timestamp: latest.timestamp });
    await stub(page, "GET", "/api/timings", { items: [] });
    await stub(page, "POST", "/api/analyze", { alerts: [], recommendations: [] });
    await tour(page, "/performance", "sentry-only", "Page loads (sampled)");
  });
});
