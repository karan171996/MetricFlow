export {}; // make this file a module so top-level names do not clash across specs
// The 3D look of the whole dashboard (app/globals.css under html:not([data-depth="off"]), set by
// components/Depth3D.tsx): on by default, and off for reduced motion, a stored "off", or the Settings switch.
// The browser is told what it is before the page loads; FAKE data only, the API is stubbed.
const KEY = "metricflow:3d";
const at = "2026-01-01T00:00:00.000Z";
const sources = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic" };
const DEFAULTS = { loadSeconds: 1.5, errorPercent: 2, apdexMin: 0.9, uptimeSLA: 99.9 };

const page = (slug: string, loadTime: number) => {
  const metrics = { loadTime, traffic: { count: 400 }, vitals: { lcp: 2100, cls: 0.05, inp: 180, ttfb: 400, fid: 20 }, errorRate: 0.5, apdex: 0.95 };
  return { name: `FAKE ${slug}`, slug, url: `/${slug}`, visitors: "400", status: "Healthy", recordedAt: at, metrics, byTool: { "new-relic": metrics } };
};

type Env = { reduced?: boolean; stored?: "0" | "1"; width?: number; pages?: ReturnType<typeof page>[]; path?: string };

const visit = (env: Env = {}) => {
  const pages = env.pages ?? [page("home", 900), page("pricing", 3400), page("blog", 1700)];
  cy.viewport(env.width ?? 1440, 900);
  cy.intercept("GET", "/api/setup", { configured: true, tools: ["new-relic"], keys: {} });
  cy.intercept("GET", "/api/metrics", { configured: true, tools: ["new-relic"], failed: [], sources, project: "fake-project", pages, history: [{ timestamp: at, sources, pages }] });
  cy.intercept("GET", "/api/timings", { items: [] });
  cy.intercept("POST", "/api/analyze", { alerts: [], recommendations: [] });
  cy.intercept("GET", "/api/settings", DEFAULTS).as("settings");
  cy.visit(env.path ?? "/", {
    onBeforeLoad(win) {
      Object.defineProperty(win.navigator, "hardwareConcurrency", { value: 8, configurable: true });
      const real = win.matchMedia.bind(win);
      win.matchMedia = ((q: string) => {
        const list = real(q);
        if (/prefers-reduced-motion/.test(q)) Object.defineProperty(list, "matches", { value: Boolean(env.reduced), configurable: true });
        return list;
      }) as typeof win.matchMedia;
      if (env.stored) win.localStorage.setItem(KEY, env.stored);
    },
  });
  cy.wait("@settings");
};

const depth = () => cy.get("html");
const backdrop = ($el: JQuery<HTMLElement>) => getComputedStyle($el[0]).backdropFilter || getComputedStyle($el[0]).getPropertyValue("-webkit-backdrop-filter");

describe("The 3D look of the whole dashboard", () => {
  it("is on by default: panels are glass with depth, and the scene has a floor", () => {
    visit();
    cy.contains("h2", "Fix first", { timeout: 15000 }).should("be.visible");
    depth().should("have.attr", "data-depth", "3d");
    cy.get('[data-slot="card"]').first().should(($c) => expect(backdrop($c)).to.contain("blur"));
    cy.get('[data-slot="stat-tile"]').first().should(($c) => expect(backdrop($c)).to.contain("blur"));
    cy.get("body").then(($b) => {
      const floor = getComputedStyle($b[0], "::before");
      expect(floor.position).to.equal("fixed");
      expect(floor.pointerEvents).to.equal("none");
    });
  });

  it("a card's glare follows the pointer", () => {
    visit();
    cy.get('[data-slot="stat-tile"]').first().trigger("pointermove", 14, 14).should(($c) => {
      expect(parseFloat($c[0].style.getPropertyValue("--glare-x"))).to.be.lessThan(10);
    });
  });

  it("controls get depth too, and lose it with 3D off", () => {
    const shadow = ($el: JQuery<HTMLElement>) => getComputedStyle($el[0]).boxShadow;
    visit({ path: "/settings" });
    cy.get('[data-slot="tabs-list"]', { timeout: 15000 }).should(($l) => expect(shadow($l)).to.contain("inset"));
    cy.get('[data-slot="tabs-trigger"][data-active]').should(($t) => expect(shadow($t)).to.contain("rgba"));
    visit({ path: "/settings", stored: "0" });
    cy.get('[data-slot="tabs-list"]', { timeout: 15000 }).should(($l) => expect(shadow($l)).to.equal("none"));
  });

  it("every KPI tile carries its judged status, and only a Warning or Critical one glows", () => {
    visit({ pages: [page("a", 3400), page("b", 4000)] }); // average load 3.7s: well over twice the 1.5s limit
    cy.get('[data-slot="stat-tile"]').should("have.length.at.least", 3);
    cy.contains('[data-slot="stat-tile"]', "Avg Page Load Time").should("have.attr", "data-status", "Critical");
    cy.contains('[data-slot="stat-tile"]', "Page views").should("have.attr", "data-status", "none");
  });

  it("is off, and the page is flat, when the system asks for reduced motion", () => {
    visit({ reduced: true });
    cy.contains("h2", "Fix first", { timeout: 15000 }).should("be.visible");
    depth().should("have.attr", "data-depth", "off");
    cy.get('[data-slot="card"]').first().should(($c) => expect(backdrop($c)).to.be.oneOf(["none", ""]));
    cy.get("body").then(($b) => expect(getComputedStyle($b[0], "::before").position).to.not.equal("fixed"));
  });

  it("is off when the user turned it off, and the Settings switch changes it live", () => {
    visit({ stored: "0", path: "/settings" });
    depth().should("have.attr", "data-depth", "off");
    cy.get('[role="switch"][aria-label="3D views"]', { timeout: 15000 }).click();
    depth().should("have.attr", "data-depth", "3d");
    cy.get('[role="switch"][aria-label="3D views"]').click();
    depth().should("have.attr", "data-depth", "off");
  });

  it("does not make the page scroll sideways, on a desktop or a phone", () => {
    for (const width of [1440, 390]) {
      visit({ width });
      cy.contains("h2", "Fix first", { timeout: 15000 }).should("exist");
      cy.document().then((doc) => expect(doc.documentElement.scrollWidth, `width ${width}`).to.be.at.most(doc.documentElement.clientWidth));
    }
  });
});
