import { expect, test } from "@playwright/test";

test("health API returns ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect((await res.json()).status).toBe("ok");
});

for (const path of ["/", "/performance", "/settings"]) {
  test(`${path} loads`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("body")).toBeVisible();
  });
}
