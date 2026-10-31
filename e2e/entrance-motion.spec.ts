import { expect, test, type Locator, type Page } from "@playwright/test";
import { formatDuration } from "../lib/formatDuration";
import { contains, fakeIntervals, stub, tick, type Stub } from "./helpers";

// Entrance motion: titles fade and rise once; the "MetricFlow API response times" bars grow and count up once, then only move for changed values.
// The API is stubbed (FAKE fixtures only). Only the 30s refresh timers are faked, so CSS animations and requestAnimationFrame run for real.
const at = "2026-01-01T00:00:00.000Z";
const nrMetrics = { traffic: { count: 40 }, loadTime: 1200, apdex: 0.95, vitals: { lcp: 2100, cls: 0.05, inp: 180, ttfb: 400, fid: 20 }, errorRate: 0.2 };
const sources = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic" };
const newRelic = { loadTime: 1200, lcp: 2100, ttfb: 400, cls: 0.05, inp: 180, fid: 20, errorRate: 0.2, throughput: 40, apdexScore: 0.95 }; // the tool page still reads the old fields
const pageRow = { name: "FAKE Blog", slug: "blog", url: "/blog", visitors: "40", status: "Healthy", recordedAt: at, newRelic, metrics: nrMetrics, byTool: { "new-relic": nrMetrics } };
const good = { configured: true, tools: ["new-relic"], failed: [], sources, project: "fake-project", pages: [pageRow], history: [{ timestamp: at, sources, pages: [pageRow] }], timestamp: at };
const src = { recent: 0, lastEventAt: null };

type Item = { name: string; value: number };
const FIRST: Item[] = [{ name: "FAKE slow", value: 1840 }, { name: "FAKE mid", value: 268 }, { name: "FAKE fast", value: 190 }];
// One value changed (mid, still below the longest bar so the scale stays put) and one new name.
const SECOND: Item[] = [FIRST[0], { name: "FAKE mid", value: 350 }, FIRST[2], { name: "FAKE new", value: 300 }];
const REFRESH_MS = 30000;
const GROW_MS = 800;
const READERS = 2; // the screen and the header each read /api/metrics

type Frame = Record<string, { w: number; label: string }>;
/** What the page records about itself (see `watch`). */
type Recorder = {
  frames: Frame[]; // every distinct state the bar chart was painted in, in order
  lastChange: number; // when the newest frame was recorded
  events: { type: string; el: HTMLElement; top: number; below: number }[]; // every title animation start/end, with its layout box at that moment
  shifted: string[]; // titles the browser reported as a layout shift source
  errors: string[]; // console.error calls
  mark?: { frames: number; starts: Element[] };
};
declare global { interface Window { __mf: Recorder } }

let items: Item[];
let timings: Stub, metrics: Stub, analyze: Stub;

/** Records, inside the page, what a user would see on every frame: no round trip to the test, so nothing is missed. */
const watch = (page: Page) => page.addInitScript(() => {
  const mf: Recorder = { frames: [], lastChange: 0, events: [], shifted: [], errors: [] };
  window.__mf = mf;
  const consoleError = console.error;
  console.error = (...args: unknown[]) => { mf.errors.push(args.map(String).join(" ")); consoleError.apply(console, args); };
  for (const type of ["animationstart", "animationend"]) document.addEventListener(type, (e) => {
    const el = e.target as HTMLElement;
    if (el.matches?.(".title-enter")) mf.events.push({ type, el, top: el.offsetTop, below: el.nextElementSibling?.getBoundingClientRect().top ?? 0 });
  });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as unknown as { sources: { node: Node | null }[] }[])
      for (const s of entry.sources) if (s.node instanceof Element && s.node.matches(".title-enter")) mf.shifted.push(s.node.textContent ?? "");
  }).observe({ type: "layout-shift", buffered: true });
  const sample = () => {
    const svg = document.querySelector(".recharts-bar")?.closest("svg");
    const bars = [...(svg?.querySelectorAll(".recharts-bar-rectangle path") ?? [])];
    if (svg && bars.length) {
      const labels = [...svg.querySelectorAll(".recharts-label-list text")];
      const frame: Frame = {};
      for (const bar of bars) {
        const mid = Number(bar.getAttribute("y")) + Number(bar.getAttribute("height")) / 2;
        const label = labels.find((l) => Math.abs(Number(l.getAttribute("y")) - mid) < 2);
        frame[bar.getAttribute("name") ?? ""] = { w: Number(bar.getAttribute("width")), label: label?.textContent ?? "" };
      }
      if (JSON.stringify(frame) !== JSON.stringify(mf.frames[mf.frames.length - 1])) { mf.frames.push(frame); mf.lastChange = performance.now(); }
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
});
const visit = async (page: Page, path: string) => { await watch(page); await page.goto(path); };
const allRead = async () => { for (let i = 0; i < READERS; i++) await metrics.wait(); };
const refresh = async (page: Page, next: Item[]) => {
  items = next;
  await tick(page, REFRESH_MS);
  await allRead();
  await timings.wait();
};
const getFrames = (page: Page) => page.evaluate(() => window.__mf.frames);
/** The chart shows exactly the formatted final value for every item and has stopped changing. */
const settled = (page: Page, want: Item[]) =>
  expect.poll(() => page.evaluate(() => {
    const m = window.__mf;
    const last = m.frames[m.frames.length - 1] ?? {};
    return { labels: Object.fromEntries(Object.entries(last).map(([name, row]) => [name, row.label])), stoppedChanging: performance.now() - m.lastChange > 200 };
  }), { message: "the chart has its final labels and stopped changing" })
    .toEqual({ labels: Object.fromEntries(want.map((i) => [i.name, formatDuration(i.value)])), stoppedChanging: true });
const ms = (label: string) => (label.endsWith("ms") ? parseFloat(label) : parseFloat(label) * 1000);
const seen = (from: Frame[], name: string) => from.filter((f) => f[name]).map((f) => f[name]);
const rising = (values: number[]) => values.every((v, i) => i === 0 || v >= values[i - 1]);
const near = (actual: number, want: number, delta: number, msg: string) => expect(Math.abs(actual - want), `${msg}: ${actual} vs ${want}`).toBeLessThanOrEqual(delta);
/** A count-up never shows a bare zero (other specs assert "0ms" never appears) and never undershoots into a negative bar or label. */
const neverBelowZero = (from: Frame[]) => from.forEach((f) => Object.entries(f).forEach(([name, r]) => {
  expect(r.label, `${name}: label`).not.toMatch(/^-|^0(ms|s)?$/);
  expect(r.w, `${name}: width`).toBeGreaterThanOrEqual(0);
}));
const titleStyle = (l: Locator) => l.evaluate((el) => { const cs = getComputedStyle(el); return { name: cs.animationName, duration: cs.animationDuration, opacity: cs.opacity, transform: cs.transform }; });
const ENTERED = { name: "enter", duration: "0.4s", opacity: "1", transform: "none" };
const hasEntered = (l: Locator, want: object = ENTERED) => expect.poll(() => titleStyle(l)).toEqual(want);
/** Titles on screen whose entrance started. A title that only lived in the loading fallback is gone and not counted. */
const entered = (page: Page) => page.evaluate(() => {
  const els = window.__mf.events.filter((e) => e.type === "animationstart" && e.el.isConnected).map((e) => e.el);
  return { texts: els.map((e) => e.textContent), distinct: new Set(els).size, count: els.length };
});
/** Remembers the chart states and entered titles so far, to compare later. */
const mark = (page: Page) => page.evaluate(() => {
  const m = window.__mf;
  m.mark = { frames: m.frames.length, starts: m.events.filter((e) => e.type === "animationstart" && e.el.isConnected).map((e) => e.el) };
  return m.mark.frames;
});
/** Since `mark`: how many chart states were added, and whether the entered titles are exactly the same elements. */
const sinceMark = (page: Page) => page.evaluate(() => {
  const m = window.__mf, was = m.mark!;
  const now = m.events.filter((e) => e.type === "animationstart" && e.el.isConnected).map((e) => e.el);
  return { newFrames: m.frames.length - was.frames, sameTitles: now.length === was.starts.length && now.every((el, i) => el === was.starts[i]) };
});
const noConsoleErrors = async (page: Page) => expect(await page.evaluate(() => window.__mf.errors)).toEqual([]);

test.beforeEach(async ({ page }) => {
  items = FIRST;
  await page.setViewportSize({ width: 1440, height: 900 }); // the header title is hidden at narrower widths
  await stub(page, "GET", "/api/setup", { configured: true, tools: ["new-relic"], keys: {} });
  await stub(page, "GET", "/api/connect", { configured: true, tools: ["new-relic"], insertKeySet: false, accountId: "1234567", browser: src, ajax: src, custom: src });
  timings = await stub(page, "GET", "/api/timings", () => ({ items }));
  analyze = await stub(page, "POST", "/api/analyze", { alerts: [], recommendations: [] });
  metrics = await stub(page, "GET", "/api/metrics", good);
  await fakeIntervals(page);
});

test.describe("entrance motion", () => {
  test("home: titles enter once, bars grow on a fixed scale and count up, a refresh moves only what changed", async ({ page }) => {
    await visit(page, "/");
    await allRead();
    await timings.wait();
    await analyze.wait(); // the first load is only over after its last request
    await settled(page, FIRST);

    const frames = await getFrames(page);
    const end = frames[frames.length - 1];
    // Bars grow: each one gets wider frame by frame and the labels pass through values below the final one.
    for (const { name, value } of FIRST) {
      const rows = seen(frames, name);
      expect(new Set(rows.map((r) => r.w)).size, `${name}: distinct widths`).toBeGreaterThan(3);
      expect(rising(rows.map((r) => r.w)), `${name}: width only grows`).toBe(true);
      expect(rows.some((r) => r.label && ms(r.label) > 0 && ms(r.label) < value), `${name}: label counts up`).toBe(true);
      near(end[name].w / end["FAKE slow"].w, value / 1840, 0.01, `${name}: final width relative to the longest bar`);
    }
    // The scale never moves: while a bar grows, pixels per millisecond stay what they are at the end.
    const scale = end["FAKE mid"].w / 268;
    const midway = frames.flatMap((f) => Object.values(f)).filter((r) => /^\d+ms$/.test(r.label) && ms(r.label) >= 50);
    expect(midway.length, "frames with a millisecond label").toBeGreaterThan(5);
    midway.forEach((r) => near(r.w / ms(r.label), scale, scale * 0.03, `scale at ${r.label}`));
    neverBelowZero(frames);
    await expect(page.locator(".recharts-reference-line line")).toHaveAttribute("stroke", "none"); // the line that holds the scale is not drawn
    await expect(page.locator(".recharts-reference-line text")).toHaveCount(0);

    await hasEntered(contains(page, "[data-slot=card-title]", "MetricFlow API response times"));
    await hasEntered(contains(page, "header h1", "fake-project"));
    const titles = await entered(page);
    expect(titles.texts).toEqual(expect.arrayContaining(["MetricFlow API response times", "fake-project"]));
    expect(titles.count, "each title on screen entered once").toBe(titles.distinct);

    // A refresh with the same numbers: no title replays, no bar or label changes.
    const framesBefore = await mark(page);
    await refresh(page, FIRST);
    await page.waitForTimeout(GROW_MS + 200); // a replay would be over, and recorded, by now
    const unchanged = await sinceMark(page);
    expect(unchanged.newFrames, "chart states after an unchanged refresh").toBe(0);
    expect(unchanged.sameTitles, "after a refresh: the same title elements, no new animation start").toBe(true);

    // One value changed and one name is new: the changed bar moves from old to new, the new one starts at zero, the rest stand still.
    await refresh(page, SECOND);
    await settled(page, SECOND);
    const after = (await getFrames(page)).slice(framesBefore);
    const mid = seen(after, "FAKE mid").map((r) => ms(r.label));
    expect(Math.min(...mid), "mid never drops below its old value").toBeGreaterThanOrEqual(268);
    expect(mid.some((v) => v > 268 && v < 350), "mid passes through values in between").toBe(true);
    expect(rising(mid), "mid only rises").toBe(true);
    const fresh = seen(after, "FAKE new");
    expect(fresh[0].w, "new bar starts near zero").toBeLessThan(fresh[fresh.length - 1].w / 2);
    expect(rising(fresh.map((r) => r.w)), "new bar only grows").toBe(true);
    for (const name of ["FAKE slow", "FAKE fast"]) expect([...new Set(seen(after, name).map((r) => `${r.w} ${r.label}`))], `${name} did not move`).toHaveLength(1);
    neverBelowZero(after);
    expect((await sinceMark(page)).sameTitles, "after a changed refresh: the same title elements, no new animation start").toBe(true);
    expect(await page.evaluate(() => window.__mf.shifted), "titles reported as layout shifts").toEqual([]);

    // The tooltip reads the real value, not the animated one.
    await page.locator('.recharts-bar-rectangle path[name="FAKE mid"]').hover({ force: true });
    const tooltip = page.locator(".recharts-tooltip-wrapper").filter({ hasText: "FAKE mid" }).first();
    await expect(tooltip).toContainText("FAKE mid");
    await expect(tooltip).toContainText("350ms");
    await noConsoleErrors(page);
  });

  test("reduced motion: titles and final bars are there on the first paint, nothing animates", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await visit(page, "/");
    await settled(page, FIRST);
    const recorded = await page.evaluate(() => ({ frames: window.__mf.frames.length, events: window.__mf.events.length }));
    expect(recorded.frames, "chart states").toBe(1); // the first painted state is already the final one
    expect(recorded.events, "title animations").toBe(0);
    for (const sel of ["[data-slot=card-title]", "header h1"]) await hasEntered(page.locator(sel).first(), { ...ENTERED, name: "none", duration: "0s" });
    await noConsoleErrors(page);
  });

  test("no timings: the empty text is unchanged", async ({ page }) => {
    items = [];
    await visit(page, "/");
    await expect(contains(page, "MetricFlow API response times")).toBeVisible();
    await expect(contains(page, "No API calls measured yet — refresh once /api/metrics has run.")).toBeVisible();
    await expect(page.locator(".recharts-bar")).toHaveCount(0);
  });

  for (const [path, text] of [["/settings", "Settings"], ["/setup", "Setup"], ["/performance", "Performance Hub"], ["/connect", "Connect your app"], ["/tools/new-relic", "New Relic"]] as const) {
    test(`${path}: the page title enters once, ends fully visible and moves nothing around it`, async ({ page }) => {
      await visit(page, path);
      await hasEntered(contains(page, "h1.title-enter", text));
      const run = await page.evaluate((t) => {
        const mine = window.__mf.events.filter((e) => e.el.isConnected && e.el.textContent === t);
        return { types: mine.map((e) => e.type), start: [mine[0]?.top, mine[0]?.below], end: [mine[1]?.top, mine[1]?.below], shifted: window.__mf.shifted };
      }, text);
      expect(run.types, "animation events").toEqual(["animationstart", "animationend"]);
      expect(run.end, "layout box at the end equals the start").toEqual(run.start);
      expect(run.shifted, "titles reported as layout shifts").toEqual([]);
    });
  }
});
