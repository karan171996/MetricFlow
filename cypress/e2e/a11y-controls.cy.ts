export {}; // make this file a module so top-level names do not clash across specs
// Piece 4: no dead controls, named icon-only controls, card headings, no sideways scroll, header readable on mobile.
// The API is stubbed (FAKE fixtures only), as in fix-first.cy.ts.
const at = "2026-01-01T00:00:00.000Z";
const SOURCES = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic", errors: "sentry" };
const VITALS = { lcp: 2100, cls: 0.05, inp: 180, ttfb: 400, fid: 20 };
const metrics = { traffic: { count: 40 }, vitals: VITALS, loadTime: 300, errorRate: 0.1, apdex: 1, errors: { count: 2, latest: [] } };
const PAGES = [{ name: "FAKE home", slug: "home", url: "/home", visitors: "40", status: "Healthy", recordedAt: at, metrics, byTool: { "new-relic": metrics } }];
const SLOW = { timeout: 15000 };

const open = (path: string, width = 1440, height = 900) => {
  cy.viewport(width, height);
  cy.intercept("GET", "/api/setup", { configured: true, tools: ["new-relic", "sentry"], keys: {} });
  cy.intercept("GET", "/api/metrics", { configured: true, tools: ["new-relic", "sentry"], failed: [], sources: SOURCES, project: "fake-project-with-a-rather-long-name", pages: PAGES, history: [{ timestamp: at, sources: SOURCES, pages: PAGES }], timestamp: at });
  cy.intercept("GET", "/api/timings", { items: [] });
  cy.intercept("POST", "/api/analyze", { alerts: [], recommendations: [] });
  cy.intercept("GET", "/api/settings", { loadSeconds: 1.5, errorPercent: 2, apdexMin: 0.9, uptimeSLA: 99.9 });
  cy.visit(path);
};

it("home has no range toggle and no notification bell", () => {
  open("/");
  cy.contains("h3", "TTFB", SLOW).should("exist");
  ["1D", "7D", "30D"].forEach((t) => cy.contains("button", new RegExp(`^${t}$`)).should("not.exist"));
  cy.get('[aria-label*="otification" i]').should("not.exist");
});

it("every link and button in the sidebar and header has an accessible name", () => {
  open("/");
  cy.get("header h1", SLOW).should("be.visible");
  cy.get('[data-slot="sidebar"] a, [data-slot="sidebar"] button, header a, header button').should(($els) => {
    expect($els.length, "controls found").to.be.greaterThan(0);
    $els.each((_, el) => {
      const labelledby = el.getAttribute("aria-labelledby");
      const byId = labelledby ? document.getElementById(labelledby)?.textContent : "";
      const name = (el.getAttribute("aria-label") || byId || el.textContent || "").trim();
      expect(name, `name of ${el.outerHTML.slice(0, 80)}`).to.not.equal("");
    });
  });
});

it("card titles are headings", () => {
  open("/");
  cy.get("h3", SLOW).should("have.length.at.least", 3);
});

describe("no horizontal page scroll", () => {
  [390, 768, 800, 1440].forEach((width) => {
    ["/", "/performance"].forEach((path) => {
      it(`${path} at ${width}px`, () => {
        open(path, width);
        cy.get("header h1", SLOW).should("be.visible");
        cy.get("h2", SLOW).should("exist");
        cy.document().should((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth));
      });
    });
  });
});

it("at 390px the header shows the project name and the status line", () => {
  open("/", 390, 844);
  cy.get("header h1", SLOW).should("be.visible").and("contain", "fake-project");
  cy.contains("header p", "1 of 1 pages reporting").should("be.visible").and("contain", "updated");
});
