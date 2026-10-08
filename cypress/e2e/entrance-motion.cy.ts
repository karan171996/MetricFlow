// Entrance motion: titles fade and rise once; the "Rankings Moved" bars grow and count up once, then only move for changed values.
// The API is stubbed (FAKE fixtures only). Only the 30s refresh timers are faked, so CSS animations and requestAnimationFrame run for real.
import { formatDuration } from "../../lib/formatDuration";

const at = "2026-01-01T00:00:00.000Z";
const nrMetrics = { traffic: { count: 40 }, loadTime: 1200, apdex: 0.95, vitals: { lcp: 2100, cls: 0.05, inp: 180, ttfb: 400, fid: 20 }, errorRate: 0.2 };
const sources = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic" };
const newRelic = { loadTime: 1200, lcp: 2100, ttfb: 400, cls: 0.05, inp: 180, fid: 20, errorRate: 0.2, throughput: 40, apdexScore: 0.95 }; // the tool page still reads the old fields
const page = { name: "FAKE Blog", slug: "blog", url: "/blog", visitors: "40", status: "Healthy", recordedAt: at, newRelic, metrics: nrMetrics, byTool: { "new-relic": nrMetrics } };
const good = { configured: true, tools: ["new-relic"], failed: [], sources, project: "fake-project", pages: [page], history: [{ timestamp: at, sources, pages: [page] }], timestamp: at };
const src = { recent: 0, lastEventAt: null };

type Item = { name: string; value: number };
const FIRST: Item[] = [{ name: "FAKE slow", value: 1840 }, { name: "FAKE mid", value: 268 }, { name: "FAKE fast", value: 190 }];
// One value changed (mid, still below the longest bar so the scale stays put) and one new name.
const SECOND: Item[] = [FIRST[0], { name: "FAKE mid", value: 350 }, FIRST[2], { name: "FAKE new", value: 300 }];
const REFRESH_MS = 30000;
const GROW_MS = 800;
const READERS = 3; // the screen, the header and the threshold alert each read /api/metrics

type Frame = Record<string, { w: number; label: string }>;
let items: Item[];
let frames: Frame[]; // every distinct state the bar chart was painted in, in order
let lastChange: number; // when the newest frame was recorded
let events: { type: string; el: HTMLElement; top: number; below: number }[]; // every title animation start/end, with its layout box at that moment
let shifted: string[]; // titles the browser reported as a layout shift source

/** Records, inside the page, what a user would see on every frame: no Cypress round trip, so nothing is missed. */
const watch = (win: Cypress.AUTWindow) => {
  cy.spy(win.console, "error").as("consoleError");
  ["animationstart", "animationend"].forEach((type) => win.document.addEventListener(type, (e) => {
    const el = e.target as HTMLElement;
    if (el.matches(".title-enter")) events.push({ type, el, top: el.offsetTop, below: el.nextElementSibling?.getBoundingClientRect().top ?? 0 });
  }));
  new win.PerformanceObserver((list) => {
    for (const entry of list.getEntries() as unknown as { sources: { node: Node | null }[] }[])
      for (const s of entry.sources) if (s.node instanceof win.Element && s.node.matches(".title-enter")) shifted.push(s.node.textContent ?? "");
  }).observe({ type: "layout-shift", buffered: true });
  const sample = () => {
    const svg = win.document.querySelector(".recharts-bar")?.closest("svg");
    const bars = [...(svg?.querySelectorAll(".recharts-bar-rectangle path") ?? [])];
    if (svg && bars.length) {
      const labels = [...svg.querySelectorAll(".recharts-label-list text")];
      const frame: Frame = {};
      for (const bar of bars) {
        const mid = Number(bar.getAttribute("y")) + Number(bar.getAttribute("height")) / 2;
        const label = labels.find((l) => Math.abs(Number(l.getAttribute("y")) - mid) < 2);
        frame[bar.getAttribute("name") ?? ""] = { w: Number(bar.getAttribute("width")), label: label?.textContent ?? "" };
      }
      if (JSON.stringify(frame) !== JSON.stringify(frames[frames.length - 1])) { frames.push(frame); lastChange = win.performance.now(); }
    }
    win.requestAnimationFrame(sample);
  };
  win.requestAnimationFrame(sample);
};
const visit = (path: string) => cy.visit(path, { onBeforeLoad: watch });
const allRead = () => { for (let i = 0; i < READERS; i++) cy.wait("@metrics"); };
const refresh = (next: Item[]) => {
  cy.then(() => { items = next; });
  cy.tick(REFRESH_MS);
  allRead();
  cy.wait("@timings");
};
/** The chart shows exactly the formatted final value for every item and has stopped changing. */
const settled = (want: Item[]) =>
  cy.window({ log: false }).should((win) => {
    const last = frames[frames.length - 1] ?? {};
    expect(Object.fromEntries(Object.entries(last).map(([name, row]) => [name, row.label])), "labels").to.deep.equal(Object.fromEntries(want.map((i) => [i.name, formatDuration(i.value)])));
    expect(win.performance.now() - lastChange, "ms since the chart last changed").to.be.greaterThan(200);
  });
const ms = (label: string) => (label.endsWith("ms") ? parseFloat(label) : parseFloat(label) * 1000);
const seen = (from: Frame[], name: string) => from.filter((f) => f[name]).map((f) => f[name]);
// Titles on screen whose entrance started. A title that only lived in the loading fallback is gone and not counted.
const entered = () => events.filter((e) => e.type === "animationstart" && e.el.isConnected).map((e) => e.el);
const sameElements = (a: Element[], b: Element[]) => a.length === b.length && a.every((el, i) => el === b[i]);
const rising = (values: number[]) => values.every((v, i) => i === 0 || v >= values[i - 1]);
/** A count-up never shows a bare zero (other specs assert "0ms" never appears) and never undershoots into a negative bar or label. */
const neverBelowZero = (from: Frame[]) => from.forEach((f) => Object.entries(f).forEach(([name, r]) => {
  expect(r.label, `${name}: label`).not.to.match(/^-|^0(ms|s)?$/);
  expect(r.w, `${name}: width`).to.be.at.least(0);
}));
const reduceMotion = (value: "reduce" | "") =>
  cy.wrap(Cypress.automation("remote:debugger:protocol", { command: "Emulation.setEmulatedMedia", params: { features: [{ name: "prefers-reduced-motion", value }] } }), { log: false });
const titleStyle = ($t: JQuery<HTMLElement>) => { const cs = getComputedStyle($t[0]); return { name: cs.animationName, duration: cs.animationDuration, opacity: cs.opacity, transform: cs.transform }; };
const ENTERED = { name: "enter", duration: "0.4s", opacity: "1", transform: "none" };

beforeEach(() => {
  items = FIRST; frames = []; events = []; shifted = []; lastChange = 0;
  cy.viewport(1440, 900); // the header title is hidden at narrower widths
  cy.intercept("GET", "/api/setup", { configured: true, tools: ["new-relic"], keys: {} });
  cy.intercept("GET", "/api/connect", { configured: true, tools: ["new-relic"], insertKeySet: false, accountId: "1234567", browser: src, ajax: src, custom: src });
  cy.intercept("GET", "/api/timings", (req) => req.reply({ items })).as("timings");
  cy.intercept("POST", "/api/analyze", { alerts: [], recommendations: [] }).as("analyze");
  cy.intercept("GET", "/api/metrics", good).as("metrics");
  cy.clock(Date.parse(at), ["setInterval", "clearInterval"]);
});
afterEach(() => reduceMotion(""));

describe("entrance motion", () => {
  it("home: titles enter once, bars grow on a fixed scale and count up, a refresh moves only what changed", () => {
    visit("/");
    allRead();
    cy.wait("@timings");
    cy.wait("@analyze"); // the first load is only over after its last request
    settled(FIRST);

    cy.then(() => {
      const end = frames[frames.length - 1];
      // Bars grow: each one gets wider frame by frame and the labels pass through values below the final one.
      for (const { name, value } of FIRST) {
        const rows = seen(frames, name);
        expect(new Set(rows.map((r) => r.w)).size, `${name}: distinct widths`).to.be.greaterThan(3);
        expect(rising(rows.map((r) => r.w)), `${name}: width only grows`).to.equal(true);
        expect(rows.some((r) => r.label && ms(r.label) > 0 && ms(r.label) < value), `${name}: label counts up`).to.equal(true);
        expect(end[name].w / end["FAKE slow"].w, `${name}: final width relative to the longest bar`).to.be.closeTo(value / 1840, 0.01);
      }
      // The scale never moves: while a bar grows, pixels per millisecond stay what they are at the end.
      const scale = end["FAKE mid"].w / 268;
      const midway = frames.flatMap((f) => Object.values(f)).filter((r) => /^\d+ms$/.test(r.label) && ms(r.label) >= 50);
      expect(midway.length, "frames with a millisecond label").to.be.greaterThan(5);
      midway.forEach((r) => expect(r.w / ms(r.label), `scale at ${r.label}`).to.be.closeTo(scale, scale * 0.03));
      neverBelowZero(frames);
    });
    cy.get(".recharts-reference-line line").should("have.attr", "stroke", "none"); // the line that holds the scale is not drawn
    cy.get(".recharts-reference-line text").should("not.exist");

    cy.contains("[data-slot=card-title]", "Rankings Moved").should(($t) => expect(titleStyle($t)).to.deep.equal(ENTERED));
    cy.contains("header h1", "fake-project").should(($t) => expect(titleStyle($t)).to.deep.equal(ENTERED));
    cy.then(() => {
      const texts = entered().map((t) => t.textContent);
      expect(texts).to.include.members(["Rankings Moved", "fake-project"]);
      expect(texts, "each title on screen entered once").to.have.length(new Set(entered()).size);
    });

    // A refresh with the same numbers: no title replays, no bar or label changes.
    let before = { frames: 0, starts: [] as Element[] };
    cy.then(() => { before = { frames: frames.length, starts: entered() }; });
    refresh(FIRST);
    cy.wait(GROW_MS + 200); // a replay would be over, and recorded, by now
    cy.then(() => {
      expect(frames.length, "chart states after an unchanged refresh").to.equal(before.frames);
      expect(sameElements(entered(), before.starts), "after a refresh: the same title elements, no new animation start").to.equal(true);
    });

    // One value changed and one name is new: the changed bar moves from old to new, the new one starts at zero, the rest stand still.
    refresh(SECOND);
    settled(SECOND);
    cy.then(() => {
      const after = frames.slice(before.frames);
      const mid = seen(after, "FAKE mid").map((r) => ms(r.label));
      expect(Math.min(...mid), "mid never drops below its old value").to.be.at.least(268);
      expect(mid.some((v) => v > 268 && v < 350), "mid passes through values in between").to.equal(true);
      expect(rising(mid), "mid only rises").to.equal(true);
      const fresh = seen(after, "FAKE new");
      expect(fresh[0].w, "new bar starts near zero").to.be.lessThan(fresh[fresh.length - 1].w / 2);
      expect(rising(fresh.map((r) => r.w)), "new bar only grows").to.equal(true);
      for (const name of ["FAKE slow", "FAKE fast"]) expect([...new Set(seen(after, name).map((r) => `${r.w} ${r.label}`))], `${name} did not move`).to.have.length(1);
      neverBelowZero(after);
      expect(sameElements(entered(), before.starts), "after a changed refresh: the same title elements, no new animation start").to.equal(true);
      expect(shifted, "titles reported as layout shifts").to.deep.equal([]);
    });

    // The tooltip reads the real value, not the animated one.
    cy.get('.recharts-bar-rectangle path[name="FAKE mid"]').trigger("mousemove", { force: true });
    cy.get(".recharts-tooltip-wrapper").should("contain.text", "FAKE mid").and("contain.text", "350ms");
    cy.get("@consoleError").should("not.have.been.called");
  });

  it("reduced motion: titles and final bars are there on the first paint, nothing animates", () => {
    reduceMotion("reduce");
    visit("/");
    settled(FIRST);
    cy.then(() => {
      expect(frames, "chart states").to.have.length(1); // the first painted state is already the final one
      expect(events, "title animations").to.have.length(0);
    });
    ["[data-slot=card-title]", "header h1"].forEach((sel) => cy.get(sel).first().should(($t) => expect(titleStyle($t)).to.deep.equal({ ...ENTERED, name: "none", duration: "0s" })));
    cy.get("@consoleError").should("not.have.been.called");
  });

  it("no timings: the empty text is unchanged", () => {
    items = [];
    visit("/");
    cy.contains("Rankings Moved").should("be.visible");
    cy.contains("No API calls measured yet — refresh once /api/metrics has run.").should("be.visible");
    cy.get(".recharts-bar").should("not.exist");
  });

  ([["/settings", "Settings"], ["/setup", "Setup"], ["/performance", "Performance Hub"], ["/connect", "Connect your app"], ["/tools/new-relic", "New Relic"]] as const).forEach(([path, text]) => {
    it(`${path}: the page title enters once, ends fully visible and moves nothing around it`, () => {
      visit(path);
      cy.contains("h1.title-enter", text).should(($t) => expect(titleStyle($t)).to.deep.equal(ENTERED));
      cy.then(() => {
        const mine = events.filter((e) => e.el.isConnected && e.el.textContent === text);
        expect(mine.map((e) => e.type), "animation events").to.deep.equal(["animationstart", "animationend"]);
        expect([mine[1].top, mine[1].below], "layout box at the end equals the start").to.deep.equal([mine[0].top, mine[0].below]);
        expect(shifted, "titles reported as layout shifts").to.deep.equal([]);
      });
    });
  });
});
