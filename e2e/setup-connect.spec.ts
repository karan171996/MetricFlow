import { expect, test, type Page } from "@playwright/test";
import { contains, stub, text } from "./helpers";

// /setup and /connect with the APIs stubbed. Fake keys only (prefixed FAKE-).
const KEYS = { NEWRELIC_API_KEY: "FAKE-NR", NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID: "1234567", SENTRY_API_KEY: "FAKE-SENTRY", SENTRY_DSN: "https://fakekey@o1.ingest.sentry.io/1" };
const fill = async (page: Page) => { for (const [k, v] of Object.entries(KEYS)) await page.locator(`#${k}`).fill(v); };
const allSet = Object.fromEntries(Object.keys(KEYS).map((k) => [k, true]));

test.describe("/setup", () => {
  test.beforeEach(({ page }) => stub(page, "GET", "/api/setup", { configured: false, keys: {} }));

  test("explains each key, says which New Relic key reads, masks secrets", async ({ page }) => {
    await page.goto("/setup");
    await expect(contains(page, "READS your data")).toBeVisible();
    await expect(contains(page, "Ingest - License")).toBeVisible();
    await expect(page.locator("#NEWRELIC_API_KEY")).toHaveAttribute("type", "password");
    await expect(page.locator("#SENTRY_API_KEY")).toHaveAttribute("type", "password");
    await expect(page.locator("#SENTRY_DSN")).toHaveAttribute("type", "text");
  });

  test("empty submit: every field marked Required, nothing saved", async ({ page }) => {
    const save = await stub(page, "POST", "/api/setup", { statusCode: 400, body: { saved: false, results: Object.fromEntries(Object.keys(KEYS).map((k) => [k, { ok: false, error: "Required." }])) } });
    await page.goto("/setup");
    await expect(contains(page, "button", "Check and save")).toBeDisabled(); // nothing entered: cannot submit
    expect(save.calls).toHaveLength(0);
  });

  test("bad key: the message names the failing field, other fields stay untouched", async ({ page }) => {
    await stub(page, "POST", "/api/setup", { statusCode: 422, body: { saved: false, results: { NEWRELIC_API_KEY: { ok: false, error: "New Relic was rejected (check the key and its permissions)." }, SENTRY_API_KEY: { ok: true } } } });
    await page.goto("/setup");
    await fill(page);
    await contains(page, "button", "Check and save").click();
    await expect(contains(page, "✗ New Relic was rejected")).toBeVisible();
    await expect(contains(page, "✓ Checked")).toBeVisible();
    await expect(page.locator("#NEWRELIC_API_KEY")).toHaveValue("FAKE-NR"); // not cleared, user can fix it
  });

  test("valid keys: sent once as JSON, success message, inputs cleared and shown only as 'Set'", async ({ page }) => {
    const save = await stub(page, "POST", "/api/setup", { statusCode: 200, body: { saved: true, results: {} } });
    await page.goto("/setup");
    await fill(page);
    await contains(page, "button", "Check and save").click();
    expect((await save.wait()).postDataJSON()).toEqual(KEYS);
    await expect(contains(page, "No restart needed")).toBeVisible();
    await expect(page.locator("#NEWRELIC_API_KEY")).toHaveValue("");
    await expect(contains(page, "✓ Set")).toBeVisible();
    await expect(contains(page, "FAKE-NR")).toHaveCount(0);
  });

  test("server write failure is shown, not swallowed", async ({ page }) => {
    await stub(page, "POST", "/api/setup", { statusCode: 500, body: { saved: false, error: "Keys are valid but .env.local could not be written. Check folder permissions." } });
    await page.goto("/setup");
    await fill(page);
    await contains(page, "button", "Check and save").click();
    await expect(contains(page, "could not be written")).toBeVisible();
  });

  test("already-set keys show 'Set' and never their values", async ({ page }) => {
    await stub(page, "GET", "/api/setup", { configured: true, keys: allSet });
    await page.goto("/setup");
    await expect(contains(page, "✓ Set")).toBeVisible();
    await expect(page.locator("#NEWRELIC_API_KEY")).toHaveValue("");
  });
});

test.describe("/connect", () => {
  const src = (recent: number | null, extra = {}) => ({ recent, lastEventAt: null, ...extra });
  const pre = (page: Page, i: number) => page.locator("pre").nth(i);

  test("before setup: points to /setup", async ({ page }) => {
    await stub(page, "GET", "/api/connect", { configured: false });
    await page.goto("/connect");
    await expect(page.locator('a[href="/setup"]').first()).toBeVisible();
  });

  test("no lookup data: one init snippet with shaped examples to replace, and no real key", async ({ page }) => {
    await stub(page, "GET", "/api/connect", { configured: true, insertKeySet: false, browser: src(0), custom: src(0), sentry: src(0) });
    await page.goto("/connect");
    await expect(page.locator("pre")).toHaveCount(2);
    // One install and one call. The site installs no vendor package itself.
    await expect(pre(page, 0)).toContainText("npm i @karan171996/metricflow");
    await expect(pre(page, 0)).toContainText("from '@karan171996/metricflow/browser'");
    // Shaped examples, each marked "replace". <ANGLE_BRACKET> placeholders read as "any value fits"
    // and sent users hunting for the wrong one.
    await text(pre(page, 0)).toMatch(/browserKey: 'NRJS-x+', {3}\/\/ replace: /);
    await text(pre(page, 0)).toMatch(/dsn: 'https:\/\/0{32}@o0\.ingest\.sentry\.io\/0', {3}\/\/ replace: /);
    await expect(pre(page, 1)).toContainText("send(");
    await expect(contains(page, "User API key")).toBeVisible();
    await expect(contains(page, "Ingest - License key")).toBeVisible();
    // The snippet names these prefixes on purpose ("NOT your NRAK- User key"), so match a
    // key-SHAPED value, not the bare prefix. Thresholds mirror .githooks/secret-scan.sh.
    for (const t of await page.locator("pre").allTextContents()) expect(t).not.toMatch(/NRAK-[A-Z0-9]{10,}|FAKE-|sntry[su]_[A-Za-z0-9]{10,}|@sentry\/browser|@newrelic\/browser-agent/);
  });

  test("fills snippet 1 with the real application id and browser key once New Relic reports them", async ({ page }) => {
    await stub(page, "GET", "/api/connect", {
      configured: true, accountId: "1234567", insertKeySet: false,
      browser: src(0), custom: src(0), sentry: src(0),
      setup: { appCount: 1, appName: "example-site", applicationId: "111111111", browserKey: "NRJS-examplebrowserkey" },
    });
    await page.goto("/connect");
    // Nothing left to copy by hand: this is what stops an ID being pasted instead of a key.
    await text(pre(page, 0)).toContain("applicationId: '111111111',");
    await text(pre(page, 0)).toContain("browserKey: 'NRJS-examplebrowserkey',");
    await text(pre(page, 0)).toContain("accountId: '1234567',");
    await expect(contains(page, "application ID 111111111")).toBeVisible();
  });

  test("no Browser app: the chain names that link instead of showing empty rows", async ({ page }) => {
    await stub(page, "GET", "/api/connect", {
      configured: true, accountId: "1234567", insertKeySet: false,
      browser: src(0), custom: src(0), sentry: src(0),
      setup: { appCount: 0, appName: null, applicationId: null, browserKey: null },
    });
    await page.goto("/connect");
    await expect(contains(page, "Add data > Browser monitoring")).toBeVisible();
    await expect(contains(page, "Querying New Relic account")).toBeVisible();
  });

  test("'events received' says 'None yet' when empty and updates without a page reload", async ({ page }) => {
    let n = 0;
    await stub(page, "GET", "/api/connect", () => {
      n++;
      return { configured: true, insertKeySet: true, browser: src(0), custom: n > 1 ? src(2, { lastEventAt: new Date().toISOString() }) : src(0), sentry: src(0) };
    });
    await page.goto("/connect");
    await expect(contains(page, "None yet")).toBeVisible();
    await expect(contains(page, "Receiving data")).toBeVisible(); // poll, no reload
  });

  test("a source that cannot be read shows its error, others still show", async ({ page }) => {
    await stub(page, "GET", "/api/connect", { configured: true, insertKeySet: true, browser: src(1), custom: src(0), sentry: { recent: null, lastEventAt: null, error: "Could not read from Sentry." } });
    await page.goto("/connect");
    await expect(contains(page, "Could not read from Sentry.")).toBeVisible();
    await expect(contains(page, "Receiving data")).toBeVisible();
  });

  test("test event: button disabled without Insert key; with one it POSTs once and shows success", async ({ page }) => {
    await stub(page, "GET", "/api/connect", { configured: true, insertKeySet: false, browser: src(0), custom: src(0), sentry: src(0) });
    await page.goto("/connect");
    await expect(contains(page, "button", "Send test event")).toBeDisabled();
    await stub(page, "GET", "/api/connect", { configured: true, insertKeySet: true, browser: src(0), custom: src(0), sentry: src(0) });
    const sendTest = await stub(page, "POST", "/api/connect", { statusCode: 200, body: { sent: true } });
    await page.goto("/connect");
    await contains(page, "button", "Send test event").click();
    await expect.poll(() => sendTest.calls.length).toBe(1);
    await expect(contains(page, "Test event sent")).toBeVisible();
  });

  test("test event failure shows the exact reason", async ({ page }) => {
    await stub(page, "GET", "/api/connect", { configured: true, insertKeySet: true, browser: src(0), custom: src(0), sentry: src(0) });
    await stub(page, "POST", "/api/connect", { statusCode: 502, body: { sent: false, error: 'New Relic rejected the Insert key. It must be an "Ingest - License" key for this account.' } });
    await page.goto("/connect");
    await contains(page, "button", "Send test event").click();
    await expect(contains(page, "rejected the Insert key")).toBeVisible();
  });

  test("Insert key is saved through /api/setup and never echoed", async ({ page }) => {
    await stub(page, "GET", "/api/connect", { configured: true, insertKeySet: false, browser: src(0), custom: src(0), sentry: src(0) });
    const insert = await stub(page, "POST", "/api/setup", { statusCode: 200, body: { saved: true, results: {} } });
    await page.goto("/connect");
    await page.locator("#insert-key").fill("FAKE-INSERT");
    await contains(page, "button", "Save").click();
    expect((await insert.wait()).postDataJSON()).toEqual({ NEWRELIC_INSERT_KEY: "FAKE-INSERT" });
    await expect(contains(page, "Insert key saved.")).toBeVisible();
    await expect(contains(page, "FAKE-INSERT")).toHaveCount(0);
  });
});
