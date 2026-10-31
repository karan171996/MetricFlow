import { expect, test } from "@playwright/test";
import { contains, stub } from "./helpers";

// Phase 0 fresh-install flow, end to end with New Relic/Sentry stubbed:
// no keys -> /setup -> keys saved -> empty state -> /connect test event -> data appears.
const nr = { loadTime: 1200, lcp: 2.1, ttfb: 0.4, cls: 0.05, fid: 20, errorRate: 0.2, throughput: 40, apdexScore: 0.95 };
const pageRow = { name: "FAKE Blog", slug: "blog", url: "/blog", visitors: "40", status: "Healthy", newRelic: nr, sentry: { errorCount: 0, errorRate: 0, warningCount: 0, latestErrors: [] }, recordedAt: "2026-01-01T00:00:00.000Z" };
const src = (recent: number) => ({ recent, lastEventAt: recent ? new Date().toISOString() : null });

test("fresh install: setup prompt -> save keys -> empty state -> test event -> data", async ({ page }) => {
  let configured = false, hasData = false, eventSent = false;
  await stub(page, "GET", "/api/metrics", () => ({ configured, tools: configured ? ["new-relic", "sentry"] : [], pages: hasData ? [pageRow] : [], history: [] }));
  await stub(page, "GET", "/api/setup", () => ({ configured, tools: configured ? ["new-relic", "sentry"] : [], keys: {} }));
  await stub(page, "POST", "/api/setup", () => { configured = true; return { saved: true, results: {} }; });
  await stub(page, "GET", "/api/connect", () => ({ configured, insertKeySet: true, browser: src(0), custom: src(eventSent ? 1 : 0), sentry: src(0) }));
  await stub(page, "POST", "/api/connect", () => { eventSent = true; hasData = true; return { sent: true }; });

  await page.goto("/performance");
  await expect(page.locator('a[href="/setup"]').first()).toBeVisible(); // no fake numbers
  await expect(contains(page, /\b0ms\b|Healthy/)).toHaveCount(0);
  await page.locator('a[href="/setup"]').first().click();
  await expect(page).toHaveURL(/\/setup$/);

  for (const k of ["NEWRELIC_API_KEY", "NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID", "SENTRY_API_KEY"]) await page.locator(`#${k}`).fill("FAKE-1");
  await page.locator("#SENTRY_DSN").fill("https://fakekey@o1.ingest.sentry.io/1");
  await contains(page, "button", "Check and save").click();
  await expect(contains(page, "No restart needed")).toBeVisible();

  await page.goto("/performance");
  await expect(contains(page, "No data yet")).toBeVisible(); // configured, nothing reported
  await page.locator('a[href="/connect"]').first().click();
  await expect(page).toHaveURL(/\/connect$/);
  await expect(contains(page, "None yet")).toBeVisible();

  await contains(page, "button", "Send test event").click();
  await expect(contains(page, "Test event sent")).toBeVisible();
  await expect(contains(page, "Receiving data")).toBeVisible();

  await page.goto("/performance");
  await expect(contains(page, "FAKE Blog")).toBeVisible();
});
