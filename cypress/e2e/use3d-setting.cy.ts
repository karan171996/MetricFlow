export {}; // make this file a module so top-level names do not clash across specs
// The 3D guard (lib/use3d.ts, lib/use3dEnabled.ts) and its Settings switch. The browser is told what it
// is (cores, WebGL, reduced motion, data saver) before the page loads, so the run never depends on the
// machine's own graphics or OS settings. FAKE fixtures only; the API is stubbed.
const KEY = "metricflow:3d";
const DEFAULTS = { loadSeconds: 1.5, errorPercent: 2, apdexMin: 0.9, uptimeSLA: 99.9 };

type Env = { reduced?: boolean; cores?: number; webgl?: boolean; saveData?: boolean; stored?: "0" | "1" };

const visitSettings = (env: Env = {}) => {
  cy.viewport(1440, 900);
  cy.intercept("GET", "/api/setup", { configured: true, tools: ["new-relic"], keys: {} });
  cy.intercept("GET", "/api/metrics", { configured: true, tools: ["new-relic"], failed: [], sources: {}, project: "fake-project", pages: [], history: [] });
  cy.intercept("GET", "/api/timings", { items: [] });
  cy.intercept("GET", "/api/settings", DEFAULTS).as("settings");
  cy.visit("/settings", {
    onBeforeLoad(win) {
      const { reduced = false, cores = 8, webgl = true, saveData = false, stored } = env;
      Object.defineProperty(win.navigator, "hardwareConcurrency", { value: cores, configurable: true });
      Object.defineProperty(win.navigator, "connection", { value: { saveData }, configurable: true });
      const real = win.matchMedia.bind(win);
      // Keep the real MediaQueryList (the hook calls addEventListener on it) and only override `matches`.
      win.matchMedia = ((q: string) => {
        const list = real(q);
        if (/prefers-reduced-motion/.test(q)) Object.defineProperty(list, "matches", { value: reduced, configurable: true });
        return list;
      }) as typeof win.matchMedia;
      const realGet = win.HTMLCanvasElement.prototype.getContext;
      win.HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (/webgl/.test(type)) return webgl ? ({} as never) : null;
        return (realGet as (...a: unknown[]) => unknown).call(this, type, ...rest) as never;
      } as typeof realGet;
      if (stored) win.localStorage.setItem(KEY, stored);
    },
  });
  cy.wait("@settings");
};

const sw = () => cy.get('[role="switch"][aria-label="3D views"]', { timeout: 15000 });
const disabled = ($el: JQuery<HTMLElement>) =>
  $el.prop("disabled") === true || $el.attr("aria-disabled") === "true" || $el.is("[data-disabled]");

describe("Settings: 3D views", () => {
  it("is off by default and can be switched on, and the choice survives a reload", () => {
    visitSettings();
    sw().should("have.attr", "aria-checked", "false").and(($el) => expect(disabled($el), "enabled").to.equal(false));
    cy.contains("Off by default").should("be.visible");

    sw().click();
    sw().should("have.attr", "aria-checked", "true");
    cy.window().then((win) => expect(win.localStorage.getItem(KEY)).to.equal("1"));

    visitSettings(); // a fresh load keeps what was stored
    sw().should("have.attr", "aria-checked", "true");

    sw().click();
    sw().should("have.attr", "aria-checked", "false");
    cy.window().then((win) => expect(win.localStorage.getItem(KEY)).to.equal("0"));
  });

  it("is disabled with the reason when the system asks for reduced motion", () => {
    visitSettings({ reduced: true });
    sw().should(($el) => expect(disabled($el), "disabled").to.equal(true));
    cy.get("#three-d-views-help").should("have.attr", "data-reason", "reduced-motion").and("contain.text", "reduced motion");
  });

  it("is disabled with its own reason for a low-power device, data saver and no WebGL", () => {
    visitSettings({ cores: 2 });
    cy.get("#three-d-views-help").should("have.attr", "data-reason", "low-cores").and("contain.text", "too few processor cores");
    sw().should(($el) => expect(disabled($el), "disabled").to.equal(true));

    visitSettings({ saveData: true });
    cy.get("#three-d-views-help").should("have.attr", "data-reason", "save-data").and("contain.text", "data saver");

    visitSettings({ webgl: false });
    cy.get("#three-d-views-help").should("have.attr", "data-reason", "no-webgl").and("contain.text", "WebGL");
  });

  it("a stored 'on' does not force 3D onto a device that is limited", () => {
    visitSettings({ reduced: true, stored: "1" });
    sw().should("have.attr", "aria-checked", "false").and(($el) => expect(disabled($el), "disabled").to.equal(true));
  });

  it("the switch has an accessible name and a description", () => {
    visitSettings();
    sw().should("have.attr", "aria-describedby", "three-d-views-help");
    cy.get("#three-d-views-help").should("not.be.empty");
  });
});
