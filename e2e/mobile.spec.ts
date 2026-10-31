import { expect, test } from "@playwright/test";
import { contains } from "./helpers";

// useIsMobile() was rewritten with useSyncExternalStore: pages must still render at both sizes.
test.describe("responsive (useIsMobile)", () => {
  for (const [name, width, height] of [["mobile", 390, 844], ["desktop", 1440, 900]] as const) {
    test(`/settings renders at ${name} width`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/settings");
      await expect(contains(page, /threshold/i)).toBeAttached(); // ThresholdSettings (quotes escaped)
    });
    test(`/ renders at ${name} width`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await expect(page.locator("body")).toBeVisible();
    });
  }
});
