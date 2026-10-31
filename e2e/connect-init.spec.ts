import { expect, test, type Page } from "@playwright/test";
import { contains, stub, text } from "./helpers";

// /connect shows one init snippet with a block for each connected tool, pre-filled with public values only.
const src = (recent: number | null) => ({ recent, lastEventAt: null });
const nrSetup = { appCount: 1, appName: "example-site", applicationId: "111111111", browserKey: "NRJS-examplebrowserkey" };
const DSN = "https://0123456789abcdef0123456789abcdef@o123.ingest.sentry.io/456";
const nr = { accountId: "1234567", browser: src(0), ajax: src(0), custom: src(0), setup: nrSetup };
const pre = (page: Page, i: number) => page.locator("pre").nth(i);
const snippet = (page: Page) => text(pre(page, 0));
const noVendorInstall = async (page: Page) => {
  for (const t of await page.locator("pre").allTextContents()) expect(t).not.toMatch(/@sentry\/browser|@newrelic\/browser-agent/);
};

test.describe("/connect init snippet", () => {
  test("New Relic only: one block, filled in, with the send example and no Sentry", async ({ page }) => {
    await stub(page, "GET", "/api/connect", { configured: true, tools: ["new-relic"], insertKeySet: false, ...nr });
    await page.goto("/connect");
    await expect(page.locator("pre")).toHaveCount(2);
    await snippet(page).toContain("'new-relic': {");
    await snippet(page).toContain("browserKey: 'NRJS-examplebrowserkey',");
    await snippet(page).not.toContain("sentry");
    await snippet(page).not.toContain("replace:");
    await expect(pre(page, 1)).toContainText("send('checkout_step'");
    await expect(contains(page, "3. Verify")).toBeVisible();
    await noVendorInstall(page);
  });

  test("Sentry only: one block with the public DSN, no New Relic and no send example", async ({ page }) => {
    await stub(page, "GET", "/api/connect", { configured: true, tools: ["sentry"], insertKeySet: false, dsn: DSN, sentry: src(0) });
    await page.goto("/connect");
    await expect(page.locator("pre")).toHaveCount(1);
    await snippet(page).toContain(`dsn: '${DSN}',`);
    await snippet(page).not.toContain("new-relic");
    await snippet(page).not.toContain("replace:");
    await expect(contains(page, "2. Verify")).toBeVisible();
    await noVendorInstall(page);
  });

  test("both tools: both blocks in one call, eu region shown, and Copy copies exactly what is shown", async ({ page }) => {
    await stub(page, "GET", "/api/connect", { configured: true, tools: ["new-relic", "sentry"], insertKeySet: false, region: "eu", dsn: DSN, sentry: src(0), ...nr });
    await page.addInitScript(() => {
      const w = window as unknown as { __copied: string[] };
      w.__copied = [];
      navigator.clipboard.writeText = (t: string) => { w.__copied.push(t); return Promise.resolve(); };
    });
    await page.goto("/connect");
    await snippet(page).toMatch(/init\(\{\n {2}'new-relic': \{[\s\S]*region: 'eu',[\s\S]*\n {2}sentry: \{[\s\S]*\n\}\);$/);
    const shown = (await pre(page, 0).textContent()) ?? "";
    expect(shown.match(/npm i /g)).toHaveLength(1);
    await contains(page, "button", "Copy").click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)).toEqual([shown]);
    await expect(contains(page, "Copied")).toBeVisible();
    await noVendorInstall(page);
  });

  test("Sentry connected but its saved DSN cannot be published: says why, links to Setup, and shows the example to replace", async ({ page }) => {
    await stub(page, "GET", "/api/connect", { configured: true, tools: ["sentry"], insertKeySet: false, sentry: src(0) });
    await page.goto("/connect");
    await expect(contains(page, "Your saved Sentry DSN cannot go in a public page.")).toBeVisible();
    await expect(page.locator('a[href="/setup#sentry"]')).toBeVisible();
    await snippet(page).toMatch(/dsn: 'https:\/\/0{32}@o0\.ingest\.sentry\.io\/0', {3}\/\/ replace: /);
  });
});
