import { expect, test, type Page, type Request } from "@playwright/test";
import { contains, noSideScroll, shot, stub } from "./helpers";

// One health rule: the KPI tiles, the breakdown counts, the page status, the table summary and the breach banner all judge a value
// against the user's thresholds (lib/thresholds.ts). The API is stubbed (FAKE fixtures only), /api/settings included,
// so the run never depends on, or writes, a real .metricflow-settings.json.
const at = "2026-01-01T00:00:00.000Z";
const sources = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic" };
const DEFAULTS = { loadSeconds: 1.5, errorPercent: 2, apdexMin: 0.9, uptimeSLA: 99.9 };
const CLASSES = ["text-dash-success", "text-dash-warning", "text-dash-danger"];
type Status = "Healthy" | "Warning" | "Critical";
// A Healthy value stays white: it has none of the three status colours.
const COLOUR: Record<Status, string | undefined> = { Healthy: undefined, Warning: CLASSES[1], Critical: CLASSES[2] };

const pageOf = (slug: string, m: { loadTime?: number; errorRate?: number; apdex?: number }) => {
  const metrics = { traffic: { count: 40 }, vitals: { lcp: 2100, cls: 0.05, inp: 180, ttfb: 400, fid: 20 }, ...m };
  // The status sent here is deliberately wrong for most pages: the screen must judge the numbers itself.
  return { name: `FAKE ${slug}`, slug, url: `/${slug}`, visitors: "40", status: "Healthy", recordedAt: at, metrics, byTool: { "new-relic": metrics } };
};
const stubAll = async (page: Page, pages: object[], settings: object = DEFAULTS) => {
  await stub(page, "GET", "/api/setup", { configured: true, tools: ["new-relic"], keys: {} });
  await stub(page, "GET", "/api/metrics", { configured: true, tools: ["new-relic"], failed: [], sources, project: "fake-project", pages, history: [{ timestamp: at, sources, pages }], timestamp: at });
  await stub(page, "GET", "/api/timings", { items: [] });
  await stub(page, "POST", "/api/analyze", { alerts: [], recommendations: [] });
  return stub(page, "GET", "/api/settings", settings);
};
const visitHome = async (page: Page, pages: object[], settings: object = DEFAULTS) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const s = await stubAll(page, pages, settings);
  await page.goto("/");
  await s.wait();
};

const tile = (page: Page, label: string) => contains(page, "p", new RegExp(`^${label.replace(/[()]/g, "\\$&")}$`)).locator("xpath=..");
/** The tile's value line: its text, which status colour classes it carries, and whether its status line is muted. */
const valueLine = (t: ReturnType<typeof tile>) => t.evaluate((el, classes) => {
  const v = el.querySelectorAll(":scope > p")[1];
  return {
    text: v?.textContent,
    colours: classes.map((c) => v?.classList.contains(c)),
    white: v?.classList.contains("text-dash-foreground"),
    muted: [...(v?.querySelectorAll("span") ?? [])].some((s) => s.classList.contains("text-dash-muted")),
    tile: el.textContent ?? "",
  };
}, CLASSES);
/** The tile's value, its status line and the colour of the value. */
const tileReads = (page: Page, label: string, value: string, status: Status, limit: string) =>
  expect.poll(async () => {
    const v = await valueLine(tile(page, label));
    return { text: v.text, colours: v.colours, white: status === "Healthy" ? v.white : true, muted: v.muted };
  }, { message: label }).toEqual({ text: `${value} ${status} · ${limit}`, colours: CLASSES.map((c) => c === COLOUR[status]), white: true, muted: true });
/** A tile with nothing to judge: the bare value, no status word, no limit and no status colour. */
const tileHasNoStatus = (page: Page, label: string, value: string) =>
  expect.poll(async () => {
    const v = await valueLine(tile(page, label));
    return { text: v.text, colours: v.colours, statusWords: /Healthy|Warning|Critical|limit|min /.test(v.tile) };
  }, { message: label }).toEqual({ text: value, colours: [false, false, false], statusWords: false });
/** A row of the breakdown card: its exact label and its count. */
const breakdown = (page: Page, label: string, count: string) =>
  expect.poll(() => page.locator("[data-slot=card] span").filter({ hasText: new RegExp(`^${label.replace(/[()]/g, "\\$&")}$`) }).first()
    .evaluate((el) => [el.textContent, el.nextElementSibling?.textContent])).toEqual([label, count]);
const alertBox = (page: Page) => page.locator('[data-slot="alert"]');
/** The breach banner's line for one page: "{status} · {name}: {reasons, worst first}". */
const bannerLine = (page: Page, slug: string, line: string) => expect(alertBox(page).locator(`li[data-slug="${slug}"] > span`)).toHaveText(line);
const summary = (page: Page, t: string) => expect(page.locator('[data-slot="table-summary"]')).toHaveText(t);
const statusOf = (page: Page, slug: string, status: string) => expect(page.locator(`tbody tr[data-slug="${slug}"] [data-slot="badge"]`)).toHaveAttribute("data-status", status);

test.describe("KPI tiles show their status and limit", () => {
  test("under every limit → Healthy with the value left white, each with its limit; Page views has no status line", async ({ page }) => {
    await visitHome(page, [pageOf("blog", { loadTime: 1200, errorRate: 0.2, apdex: 0.95 })]);
    await tileReads(page, "Avg Page Load Time", "1.2s", "Healthy", "limit 1.5s");
    await tileReads(page, "Error Rate", "0.20%", "Healthy", "limit 2%");
    await tileReads(page, "Apdex Score", "0.95", "Healthy", "min 0.9");
    await tileHasNoStatus(page, "Page views (24h)", "40");
    await expect(alertBox(page)).toHaveCount(0);
  });

  test("exactly at each limit → still Healthy", async ({ page }) => {
    await visitHome(page, [pageOf("blog", { loadTime: 1500, errorRate: 2, apdex: 0.9 })]);
    await tileReads(page, "Avg Page Load Time", "1.5s", "Healthy", "limit 1.5s");
    await tileReads(page, "Error Rate", "2.00%", "Healthy", "limit 2%");
    await tileReads(page, "Apdex Score", "0.90", "Healthy", "min 0.9");
    await expect(alertBox(page)).toHaveCount(0);
  });

  test("over the limit but not over twice it → Warning in the warning colour; Apdex under its minimum is Warning", async ({ page }) => {
    await visitHome(page, [pageOf("blog", { loadTime: 2000, errorRate: 3, apdex: 0.85 })]);
    await tileReads(page, "Avg Page Load Time", "2s", "Warning", "limit 1.5s");
    await tileReads(page, "Error Rate", "3.00%", "Warning", "limit 2%");
    await tileReads(page, "Apdex Score", "0.85", "Warning", "min 0.9");
    await tileHasNoStatus(page, "Page views (24h)", "40");
    await expect(alertBox(page)).toHaveAttribute("data-severity", "warning");
    await expect(alertBox(page).locator('[data-slot="banner-title"]')).toHaveText("1 page is over a limit");
    await bannerLine(page, "blog", "Warning · FAKE blog: error rate 3.00% (limit 2%), load time 2s (limit 1.5s), Apdex 0.85 (min 0.9)");
    await expect(contains(page, "approaching threshold")).toHaveCount(0);
  });

  test("exactly twice the limit → still Warning, not Critical", async ({ page }) => {
    await visitHome(page, [pageOf("blog", { loadTime: 3000, errorRate: 4, apdex: 0.95 })]);
    await tileReads(page, "Avg Page Load Time", "3s", "Warning", "limit 1.5s");
    await tileReads(page, "Error Rate", "4.00%", "Warning", "limit 2%");
    await bannerLine(page, "blog", "Warning · FAKE blog: load time 3s (limit 1.5s), error rate 4.00% (limit 2%)");
    await expect(alertBox(page)).toHaveAttribute("data-severity", "warning");
  });

  test("over twice the limit → Critical in the danger colour; Apdex has no Critical step", async ({ page }) => {
    await visitHome(page, [pageOf("blog", { loadTime: 3200, errorRate: 4.5, apdex: 0.3 })]);
    await tileReads(page, "Avg Page Load Time", "3.2s", "Critical", "limit 1.5s");
    await tileReads(page, "Error Rate", "4.50%", "Critical", "limit 2%");
    await tileReads(page, "Apdex Score", "0.30", "Warning", "min 0.9");
    await expect(alertBox(page)).toHaveAttribute("data-severity", "critical");
    await bannerLine(page, "blog", "Critical · FAKE blog: Apdex 0.30 (min 0.9), error rate 4.50% (limit 2%), load time 3.2s (limit 1.5s)");
  });

  test("a metric no page measured → that tile has no colour and no status line, and nothing is alerted", async ({ page }) => {
    await visitHome(page, [pageOf("blog", { loadTime: 1200, apdex: 0.95 })]); // New Relic is connected but sent no error rate
    await tileReads(page, "Avg Page Load Time", "1.2s", "Healthy", "limit 1.5s");
    await tileHasNoStatus(page, "Error Rate", "0.00%");
    await tileReads(page, "Apdex Score", "0.95", "Healthy", "min 0.9");
    await expect(alertBox(page)).toHaveCount(0);
  });
});

test.describe("one rule: tiles, breakdown counts, page status, table summary and banner agree", () => {
  const fast = pageOf("fast", { loadTime: 1200, errorRate: 0.2, apdex: 0.95 });
  const slow = pageOf("slow", { loadTime: 2000, errorRate: 0.2, apdex: 0.95 });

  test("1.2s is within the 1.5s budget and raises nothing; 2.0s is outside it and is the only page alerted", async ({ page }) => {
    await visitHome(page, [fast, slow]);
    await breakdown(page, "Pages Within Load Budget (1.5s)", "1/2");
    await breakdown(page, "Pages with Apdex 0.9 or higher", "2/2");
    await tileReads(page, "Avg Page Load Time", "1.6s", "Warning", "limit 1.5s"); // the average of the two
    await summary(page, "1 of 2 pages is over a limit.");
    await statusOf(page, "slow", "Warning");
    await statusOf(page, "fast", "Healthy");
    await expect(alertBox(page).locator("li")).toHaveCount(1);
    await bannerLine(page, "slow", "Warning · FAKE slow: load time 2s (limit 1.5s)");

    // The hub gives each page the same verdict.
    await page.goto("/performance");
    await statusOf(page, "fast", "Healthy");
    await statusOf(page, "slow", "Warning");
    await summary(page, "1 of 2 pages is over a limit.");
  });

  test("a page over only its error-rate limit → in the summary's count and Warning in the table, while both breakdown counts still pass it", async ({ page }) => {
    await visitHome(page, [fast, pageOf("flaky", { loadTime: 1200, errorRate: 3, apdex: 0.95 })]);
    await breakdown(page, "Pages Within Load Budget (1.5s)", "2/2");
    await breakdown(page, "Pages with Apdex 0.9 or higher", "2/2");
    await summary(page, "1 of 2 pages is over a limit.");
    await statusOf(page, "flaky", "Warning");
    await bannerLine(page, "flaky", "Warning · FAKE flaky: error rate 3.00% (limit 2%)");
  });

  test("only the 1.2s page → counted within budget, tile Healthy, no alert", async ({ page }) => {
    await visitHome(page, [fast]);
    await breakdown(page, "Pages Within Load Budget (1.5s)", "1/1");
    await tileReads(page, "Avg Page Load Time", "1.2s", "Healthy", "limit 1.5s");
    await expect(alertBox(page)).toHaveCount(0);
  });

  test("a page with a bad Apdex is not counted as passing and is alerted as Warning", async ({ page }) => {
    await visitHome(page, [fast, pageOf("rough", { loadTime: 1200, errorRate: 0.2, apdex: 0.85 })]);
    await breakdown(page, "Pages with Apdex 0.9 or higher", "1/2");
    await breakdown(page, "Pages Within Load Budget (1.5s)", "2/2");
    await statusOf(page, "rough", "Warning");
    await expect(alertBox(page).locator("li")).toHaveCount(1);
    await bannerLine(page, "rough", "Warning · FAKE rough: Apdex 0.85 (min 0.9)");
  });
});

test.describe("custom thresholds", () => {
  const CUSTOM = { loadSeconds: 1, errorPercent: 2, apdexMin: 0.8, uptimeSLA: 99.9 };
  // Under the defaults: "a" would be Warning (Apdex 0.85 < 0.9) and "b" within the load budget (1.2s <= 1.5s).
  const a = pageOf("a", { loadTime: 900, errorRate: 0.2, apdex: 0.85 });
  const b = pageOf("b", { loadTime: 1200, errorRate: 0.2, apdex: 0.75 });

  test("load 1s and Apdex 0.8 → the labels, the counts, the tile limits and the alert all follow", async ({ page }) => {
    await visitHome(page, [a, b], CUSTOM);
    await breakdown(page, "Pages Within Load Budget (1s)", "1/2");
    await breakdown(page, "Pages with Apdex 0.8 or higher", "1/2");
    await tileReads(page, "Avg Page Load Time", "1.1s", "Warning", "limit 1s"); // average 1050ms
    await tileReads(page, "Error Rate", "0.20%", "Healthy", "limit 2%");
    await expect(tile(page, "Apdex Score")).toContainText("min 0.8");
    await expect(tile(page, "Apdex Score")).not.toContainText("min 0.9");
    await expect(contains(page, "(1.5s)")).toHaveCount(0);
    await expect(contains(page, "Apdex 0.9 or higher")).toHaveCount(0);
    await expect(alertBox(page).locator("li")).toHaveCount(1);
    await bannerLine(page, "b", "Warning · FAKE b: load time 1.2s (limit 1s), Apdex 0.75 (min 0.8)");
  });

  test("a looser load limit of 3s → both pages are within budget", async ({ page }) => {
    await visitHome(page, [a, b], { ...CUSTOM, loadSeconds: 3 });
    await breakdown(page, "Pages Within Load Budget (3s)", "2/2");
    await tileReads(page, "Avg Page Load Time", "1.1s", "Healthy", "limit 3s");
  });

  test("settings stored before apdexMin existed → the minimum is 0.9", async ({ page }) => {
    // loadSeconds 3 shows that this answer, not the built-in defaults, is what the screen is using.
    await visitHome(page, [a, b], { loadSeconds: 3, errorPercent: 2, uptimeSLA: 99.9 });
    await tileReads(page, "Avg Page Load Time", "1.1s", "Healthy", "limit 3s");
    await tileReads(page, "Apdex Score", "0.80", "Warning", "min 0.9");
    await breakdown(page, "Pages with Apdex 0.9 or higher", "0/2");
    await expect(alertBox(page).locator("li")).toHaveCount(2);
    await bannerLine(page, "a", "Warning · FAKE a: Apdex 0.85 (min 0.9)");
    await bannerLine(page, "b", "Warning · FAKE b: Apdex 0.75 (min 0.9)");
  });

  test("a browser cache written before apdexMin existed → the minimum is 0.9 while the server is unreachable", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await stubAll(page, [a, b]);
    const settings = await stub(page, "GET", "/api/settings", { statusCode: 500, body: {} });
    await page.addInitScript(() => localStorage.setItem("perf-thresholds", JSON.stringify({ loadSeconds: 3, errorPercent: 2, uptimeSLA: 99.9 })));
    await page.goto("/");
    await settings.wait();
    await tileReads(page, "Avg Page Load Time", "1.1s", "Healthy", "limit 3s");
    await tileReads(page, "Apdex Score", "0.80", "Warning", "min 0.9");
  });
});

test.describe("Settings → Performance Thresholds: Apdex Minimum", () => {
  const field = (page: Page) => contains(page, "label", "Apdex Minimum (0-1)").locator("xpath=../..");
  let save: Awaited<ReturnType<typeof stub>>;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const settings = await stubAll(page, [pageOf("blog", { loadTime: 1200, errorRate: 0.2, apdex: 0.95 })]);
    // The save is answered here, so the run never writes a settings file.
    save = await stub(page, "PUT", "/api/settings", (req: Request) => ({ ...DEFAULTS, ...req.postDataJSON() }));
    await page.goto("/settings");
    await settings.wait();
    await contains(page, "Performance Thresholds").click(); // the tab; the sliders are not on the first one
  });

  test("the slider is there with its value, range, step and help text", async ({ page }) => {
    await expect(field(page)).toContainText("Alert triggers if a page's Apdex falls below this value.");
    await expect(contains(field(page), "span", /^0\.9$/)).toBeVisible();
    const range = field(page).locator("input[type=range]");
    await expect(range).toHaveCount(1);
    await expect(range).toHaveAttribute("min", "0");
    await expect(range).toHaveAttribute("max", "1");
    await expect(range).toHaveAttribute("step", "0.05");
    await expect(range).toHaveValue("0.9");
  });

  test("moving it with the keyboard saves apdexMin with a PUT and shows the new value", async ({ page }) => {
    const range = field(page).locator("input[type=range]");
    await range.focus();
    await page.keyboard.press("ArrowRight");
    const first = (await save.wait()).postDataJSON();
    expect(Object.keys(first)).toEqual(["apdexMin"]);
    expect(first.apdexMin).toBeCloseTo(0.95, 9);
    await expect(contains(field(page), "span", /^0\.95$/)).toBeVisible();

    await range.focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await save.wait();
    expect((await save.wait()).postDataJSON().apdexMin).toBeCloseTo(0.85, 9);
    await expect(contains(field(page), "span", /^0\.85$/)).toBeVisible();
  });
});

// The real route. Each body is refused before anything is written, so no settings file is touched.
test.describe("PUT /api/settings refuses an apdexMin outside 0..1", () => {
  for (const bad of [1.5, -0.1, "0.8", null]) {
    test(`${JSON.stringify(bad)} → 400 with the range message`, async ({ request }) => {
      const res = await request.put("/api/settings", { data: { apdexMin: bad } });
      expect(res.status()).toBe(400);
      expect(await res.json()).toEqual({ error: "apdexMin must be a number between 0 and 1." });
    });
  }
});

test.describe("390px wide", () => {
  test("the tiles' values and status lines fit, with no horizontal page scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // The longest lines the tiles can show: a Critical load time and error rate, a Warning Apdex.
    const settings = await stubAll(page, [pageOf("blog", { loadTime: 12500, errorRate: 12.34, apdex: 0.3 })]);
    await page.goto("/");
    await settings.wait();
    await tileReads(page, "Avg Page Load Time", "12.5s", "Critical", "limit 1.5s");
    await tileReads(page, "Error Rate", "12.34%", "Critical", "limit 2%");
    await tileReads(page, "Apdex Score", "0.30", "Warning", "min 0.9");
    for (const label of ["Avg Page Load Time", "Error Rate", "Page views (24h)", "Apdex Score"]) {
      await expect.poll(() => tile(page, label).evaluate((el) => {
        const box = el.getBoundingClientRect();
        const value = el.querySelectorAll(":scope > p")[1];
        const line = value.getBoundingClientRect();
        return {
          tileOnScreen: box.left >= 0 && box.right <= 390, // tile starts and ends on screen
          notClipped: value.scrollWidth <= value.clientWidth, // value and status line are not clipped
          insideTile: line.left >= box.left && line.right <= box.right, // value stays inside its tile
        };
      }), { message: label }).toEqual({ tileOnScreen: true, notClipped: true, insideTile: true });
    }
    await noSideScroll(page);
    await shot(page, "one-health-rule-390");
  });
});
