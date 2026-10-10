export {}; // make this file a module so top-level names do not clash across specs
// The 3D page skyline on the home dashboard (components/DashboardCharts/PageSkyline.tsx): one tower per
// measured page, height = load time, colour = the judged status, and it steps aside for the guard.
// Real-shaped FAKE data only; the API is stubbed.
const KEY = "metricflow:3d";
const at = "2026-01-01T00:00:00.000Z";
const sources = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic" };
const DEFAULTS = { loadSeconds: 1.5, errorPercent: 2, apdexMin: 0.9, uptimeSLA: 99.9 };

const page = (slug: string, m: Record<string, unknown>) => {
  const metrics = { traffic: { count: 40 }, vitals: { lcp: 2100, cls: 0.05, inp: 180, ttfb: 400, fid: 20 }, errorRate: 0.5, apdex: 0.95, ...m };
  return { name: `FAKE ${slug}`, slug, url: `/${slug}`, visitors: "40", status: "Healthy", recordedAt: at, metrics, byTool: { "new-relic": metrics } };
};
const PAGES = [
  page("fast", { loadTime: 800 }),
  page("slow", { loadTime: 3100 }), // 2.07x the limit: Critical
  page("mid", { loadTime: 1800 }), // over the limit, under twice it: Warning
  page("ghost", { loadTime: 0, errorRate: 0, apdex: 0, traffic: { count: 0 } }), // no New Relic row: arrives as zeros
];

type Env = { reduced?: boolean; webgl?: boolean; stored?: "0" | "1"; width?: number };

const visitHome = (env: Env = {}) => {
  cy.viewport(env.width ?? 1440, 900);
  cy.intercept("GET", "/api/setup", { configured: true, tools: ["new-relic"], keys: {} });
  cy.intercept("GET", "/api/metrics", { configured: true, tools: ["new-relic"], failed: [], sources, project: "fake-project", pages: PAGES, history: [{ timestamp: at, sources, pages: PAGES }] });
  cy.intercept("GET", "/api/timings", { items: [] });
  cy.intercept("POST", "/api/analyze", { alerts: [], recommendations: [] });
  cy.intercept("GET", "/api/settings", DEFAULTS).as("settings");
  cy.visit("/", {
    onBeforeLoad(win) {
      const { reduced = false, webgl = true, stored } = env;
      Object.defineProperty(win.navigator, "hardwareConcurrency", { value: 8, configurable: true });
      const real = win.matchMedia.bind(win);
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
  cy.contains("h2", "Fix first", { timeout: 15000 }).should("be.visible"); // the page has rendered
};

const skyline = () => cy.get('[data-slot="page-skyline"]');

describe("Home: the 3D page skyline", () => {
  it("draws one tower per measured page, worst first, coloured by the judged status", () => {
    visitHome();
    skyline().should("be.visible");
    skyline().find("a.skyline-tower").then(($t) => {
      const rows = [...$t].map((el) => [el.getAttribute("data-slug"), el.getAttribute("data-status"), el.getAttribute("data-over")]);
      expect(rows).to.deep.equal([["slow", "Critical", "true"], ["mid", "Warning", "true"], ["fast", "Healthy", "false"]]);
    });
  });

  it("does not draw a page that has no performance numbers", () => {
    visitHome();
    skyline().find("a.skyline-tower").should("have.length", 3);
    skyline().find('a.skyline-tower[data-slug="ghost"]').should("not.exist");
  });

  it("every tower is a link with a text label that carries the value, the limit and the status", () => {
    visitHome();
    skyline().find('a[data-slug="slow"]').should("have.attr", "href", "/performance/slow")
      .and("have.attr", "aria-label").and("match", /FAKE slow: load time 3\.1s, limit 1\.5s, Critical/);
  });

  it("focusing a tower shows its numbers in the readout", () => {
    visitHome();
    skyline().find('a[data-slug="mid"]').focus();
    skyline().find('[data-slot="skyline-readout"]').should("contain.text", "FAKE mid").and("contain.text", "1.8s").and("contain.text", "Warning");
  });

  it("clicking a tower opens that page's detail view", () => {
    visitHome();
    skyline().find('a[data-slug="slow"]').click({ force: true });
    cy.location("pathname").should("eq", "/performance/slow");
  });

  it("a browser without WebGL still gets it: it is CSS 3D", () => {
    visitHome({ webgl: false });
    skyline().should("be.visible");
  });

  it("is not drawn when the system asks for reduced motion", () => {
    visitHome({ reduced: true });
    skyline().should("not.exist");
  });

  it("is not drawn when the user turned 3D off in Settings", () => {
    visitHome({ stored: "0" });
    skyline().should("not.exist");
  });

  it("is hidden on a phone, so the page stays clean at 390px", () => {
    visitHome({ width: 390 });
    skyline().should("not.be.visible");
    cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth));
  });
});
