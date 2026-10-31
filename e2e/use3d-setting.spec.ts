import { expect, test, type Locator, type Page } from "@playwright/test";
import { stub } from "./helpers";

// The 3D guard (lib/use3d.ts, lib/use3dEnabled.ts) and its Settings switch. The browser is told what it
// is (cores, WebGL, reduced motion, data saver) before the page loads, so the run never depends on the
// machine's own graphics or OS settings. FAKE fixtures only; the API is stubbed.
// 3D is ON by default where the device allows it; the user can switch it off.
const KEY = "metricflow:3d";
const DEFAULTS = { loadSeconds: 1.5, errorPercent: 2, apdexMin: 0.9, uptimeSLA: 99.9 };

type Env = { reduced?: boolean; cores?: number; webgl?: boolean; saveData?: boolean; stored?: "0" | "1" };

const visitSettings = async (page: Page, env: Env = {}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stub(page, "GET", "/api/setup", { configured: true, tools: ["new-relic"], keys: {} });
  await stub(page, "GET", "/api/metrics", { configured: true, tools: ["new-relic"], failed: [], sources: {}, project: "fake-project", pages: [], history: [] });
  await stub(page, "GET", "/api/timings", { items: [] });
  const settings = await stub(page, "GET", "/api/settings", DEFAULTS);
  await page.addInitScript(({ reduced = false, cores = 8, webgl = true, saveData = false, stored }: Env & { key?: string }) => {
    Object.defineProperty(navigator, "hardwareConcurrency", { value: cores, configurable: true });
    Object.defineProperty(navigator, "connection", { value: { saveData }, configurable: true });
    const real = window.matchMedia.bind(window);
    // Keep the real MediaQueryList (the hook calls addEventListener on it) and only override `matches`.
    window.matchMedia = ((q: string) => {
      const list = real(q);
      if (/prefers-reduced-motion/.test(q)) Object.defineProperty(list, "matches", { value: reduced, configurable: true });
      return list;
    }) as typeof window.matchMedia;
    const realGet = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/.test(type)) return webgl ? ({} as never) : null;
      return (realGet as (...a: unknown[]) => unknown).call(this, type, ...rest) as never;
    } as typeof realGet;
    if (stored) localStorage.setItem("metricflow:3d", stored);
  }, env);
  await page.goto("/settings");
  await settings.wait();
};

const sw = (page: Page) => page.locator('[role="switch"][aria-label="3D views"]');
const isDisabled = (l: Locator) =>
  l.evaluate((el) => (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true" || el.hasAttribute("data-disabled"));
const expectDisabled = (l: Locator, want: boolean) => expect.poll(() => isDisabled(l), { message: want ? "disabled" : "enabled" }).toBe(want);
const stored = (page: Page) => page.evaluate((k) => localStorage.getItem(k), KEY);

test.describe("Settings: 3D views", () => {
  test("is on by default, can be switched off, and the choice survives a reload", async ({ page }) => {
    await visitSettings(page);
    await expect(sw(page)).toHaveAttribute("aria-checked", "true");
    await expectDisabled(sw(page), false);
    await expect(page.locator("#three-d-views-help")).toContainText("Turned off automatically");

    await sw(page).click();
    await expect(sw(page)).toHaveAttribute("aria-checked", "false");
    expect(await stored(page)).toBe("0");

    await visitSettings(page); // a fresh load keeps what was stored
    await expect(sw(page)).toHaveAttribute("aria-checked", "false");

    await sw(page).click();
    await expect(sw(page)).toHaveAttribute("aria-checked", "true");
    expect(await stored(page)).toBe("1");
  });

  test("is disabled with the reason when the system asks for reduced motion", async ({ page }) => {
    await visitSettings(page, { reduced: true });
    await expectDisabled(sw(page), true);
    await expect(page.locator("#three-d-views-help")).toHaveAttribute("data-reason", "reduced-motion");
    await expect(page.locator("#three-d-views-help")).toContainText("reduced motion");
  });

  test("is disabled with its own reason for a low-power device and for data saver", async ({ page }) => {
    await visitSettings(page, { cores: 2 });
    await expect(page.locator("#three-d-views-help")).toHaveAttribute("data-reason", "low-cores");
    await expect(page.locator("#three-d-views-help")).toContainText("too few processor cores");
    await expectDisabled(sw(page), true);

    await visitSettings(page, { saveData: true });
    await expect(page.locator("#three-d-views-help")).toHaveAttribute("data-reason", "save-data");
    await expect(page.locator("#three-d-views-help")).toContainText("data saver");
  });

  test("a browser without WebGL does not disable the setting: the CSS 3D views do not need it", async ({ page }) => {
    await visitSettings(page, { webgl: false });
    await expect(sw(page)).toHaveAttribute("aria-checked", "true");
    await expectDisabled(sw(page), false);
  });

  test("a stored 'on' does not force 3D onto a device that is limited", async ({ page }) => {
    await visitSettings(page, { reduced: true, stored: "1" });
    await expect(sw(page)).toHaveAttribute("aria-checked", "false");
    await expectDisabled(sw(page), true);
  });

  test("the switch has an accessible name and a description", async ({ page }) => {
    await visitSettings(page);
    await expect(sw(page)).toHaveAttribute("aria-describedby", "three-d-views-help");
    await expect(page.locator("#three-d-views-help")).not.toBeEmpty();
  });
});
