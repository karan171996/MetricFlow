import { expect, test } from "@playwright/test";
import { contains, stub } from "./helpers";

// /tools/lighthouse in target mode, with every API stubbed (no Lighthouse run, no Chrome): status line and Run now.
const status = (s: object) => ({ state: "idle", done: 0, total: 0, lastRunAt: null, target: true, ...s });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stub(page, "GET", "/api/setup", { configured: true, tools: ["lighthouse"], keys: {} });
});
const metrics = (page: import("@playwright/test").Page) =>
  stub(page, "GET", "/api/metrics", { configured: true, tools: ["lighthouse"], sources: { pages: "lighthouse", lighthouse: "lighthouse" }, pages: [], history: [] });

test.describe("Lighthouse runs on the project address", () => {
  test("shows 'Running x of y' while a run is in progress, then the last run time", async ({ page }) => {
    const m = await metrics(page);
    let calls = 0;
    await stub(page, "GET", "/api/lighthouse", () => {
      calls++;
      return calls === 1 ? status({ state: "running", done: 1, total: 3 }) : status({ state: "idle", done: 3, total: 3, lastRunAt: "2026-10-17T10:00:00.000Z" });
    });
    await page.goto("/tools/lighthouse");
    await expect(contains(page, '[role="status"]', "Running 2 of 3")).toBeVisible();
    await expect(contains(page, "button", "Running…")).toBeDisabled();
    const before = m.calls.length;
    // it polls while running, and the line moves on when the run finishes
    await expect(contains(page, '[role="status"]', "Last run")).toBeVisible();
    await expect(contains(page, "button", "Run now")).toBeEnabled();
    // the finished run refetches the table at once, well before its 30s poll
    await expect.poll(() => m.calls.length, { timeout: 5000 }).toBeGreaterThan(before);
  });

  test("Run now posts JSON and shows the run starting", async ({ page }) => {
    await metrics(page);
    await stub(page, "GET", "/api/lighthouse", status({ lastRunAt: "2026-10-17T10:00:00.000Z" }));
    const run = await stub(page, "POST", "/api/lighthouse", { statusCode: 202, body: status({ state: "running", done: 0, total: 0 }) });
    await page.goto("/tools/lighthouse");
    await contains(page, "button", "Run now").click();
    expect((await run.wait()).headers()["content-type"]).toMatch(/application\/json/);
    await expect(contains(page, '[role="status"]', "Finding pages")).toBeVisible();
  });

  test("before the first run it says how long scores take; Run now with no saved address says to set one", async ({ page }) => {
    await metrics(page);
    await stub(page, "GET", "/api/lighthouse", status({}));
    const run = await stub(page, "POST", "/api/lighthouse", { statusCode: 409, body: { error: "x" } });
    await page.goto("/tools/lighthouse");
    await expect(contains(page, '[role="status"]', "Not run yet. Scores take about 10-30 seconds per page")).toBeVisible();
    await contains(page, "button", "Run now").click();
    await run.wait();
    await expect(contains(page, "Set a project address on Setup first.")).toBeVisible();
    await expect(contains(page, "Could not reach the dashboard server.")).toHaveCount(0);
  });

  test("shows the fixed error text when a run failed", async ({ page }) => {
    await metrics(page);
    await stub(page, "GET", "/api/lighthouse", status({ state: "error", error: "Lighthouse needs Google Chrome installed on this machine.", lastRunAt: "2026-10-17T10:00:00.000Z" }));
    await page.goto("/tools/lighthouse");
    await expect(contains(page, '[role="status"]', "Lighthouse needs Google Chrome installed on this machine.")).toBeVisible();
  });

  test("no project address: no status line and no Run now", async ({ page }) => {
    await metrics(page);
    const s = await stub(page, "GET", "/api/lighthouse", status({ target: false }));
    await page.goto("/tools/lighthouse");
    await s.wait();
    await expect(contains(page, "h1", "Lighthouse CI")).toBeVisible();
    await expect(contains(page, "button", "Run now")).toHaveCount(0);
  });
});
