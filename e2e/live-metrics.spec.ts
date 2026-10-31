import { expect, test } from "@playwright/test";
import { contains, shot } from "./helpers";

// LIVE: no stubs. Needs the app started in a folder with a real .env.local. Never logs key values.
test.describe("live metric cards (real .env.local)", () => {
  test("/api/metrics is configured and returns pages", async ({ request }) => {
    const res = await request.get("/api/metrics");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.configured, "keys loaded from .env.local").toBe(true);
    console.log(`pages discovered: ${body.pages.length}`);
    expect(JSON.stringify(body)).not.toMatch(/NRAK-|sntry[su]_/); // no key in the response
  });

  // Real data decides what must show: pages found -> metric cards with values; none -> honest empty state.
  test("/ and /performance show real cards when pages exist, else an honest empty state", async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const body = await (await request.get("/api/metrics")).json();
    const hasPages = body.pages.some((p: { newRelic: { throughput: number; loadTime: number } }) => p.newRelic.throughput > 0 || p.newRelic.loadTime > 0);
    await page.goto("/");
    await page.waitForTimeout(2500);
    if (hasPages) {
      for (const t of ["Avg Page Load Time", "Error Rate", "Page views (24h)", "Apdex Score"]) await expect(contains(page, t)).toBeVisible();
      await expect(contains(page, /No data yet/)).toHaveCount(0);
    } else {
      await expect(contains(page, "No data yet")).toBeVisible();
      await expect(contains(page, /\b0ms\b|Healthy/)).toHaveCount(0); // never invented zeros
    }
    await page.waitForTimeout(1000); // entrance motion ends after the data arrives: titles 400ms, bars 800ms
    await shot(page, "live-dashboard");
    await page.goto("/performance");
    await page.waitForTimeout(2500);
    await shot(page, "live-performance");
  });
});
