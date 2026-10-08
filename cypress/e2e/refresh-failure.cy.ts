export {}; // make this file a module so top-level names do not clash across specs
// A failed refresh of /api/metrics keeps the last good numbers and says so; it never turns into the setup prompt.
// The API is stubbed (FAKE fixtures only). Only the 30s refresh timers are faked, so the app itself runs normally.
const at = "2026-01-01T00:00:00.000Z";
const nrMetrics = { traffic: { count: 40 }, loadTime: 1200, apdex: 0.95, vitals: { lcp: 2100, cls: 0.05, inp: 180, ttfb: 400, fid: 20 }, errorRate: 0.2 };
const sources = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic" };
const page = { name: "FAKE Blog", slug: "blog", url: "/blog", visitors: "40", status: "Healthy", recordedAt: at, metrics: nrMetrics, byTool: { "new-relic": nrMetrics } };
const good = { configured: true, tools: ["new-relic"], failed: [], sources, project: "fake-project", pages: [page], history: [{ timestamp: at, sources, pages: [page] }], timestamp: at };

let down = false;
const REFRESH_MS = 30000;
const STALE = "Could not load the latest data.";

beforeEach(() => {
  down = false;
  cy.viewport(1440, 900); // the header subtitle is hidden at narrower widths
  cy.intercept("GET", "/api/setup", { configured: true, tools: ["new-relic"], keys: {} });
  cy.intercept("GET", "/api/timings", { items: [] });
  cy.intercept("POST", "/api/analyze", { alerts: [], recommendations: [] });
  cy.intercept("GET", "/api/metrics", (req) => req.reply(down ? { statusCode: 500, body: { error: "Could not load New Relic data." } } : { statusCode: 200, body: good })).as("metrics");
  cy.clock(Date.parse(at), ["setInterval", "clearInterval"]);
});
const refresh = (isDown: boolean) => cy.then(() => { down = isDown; }).tick(REFRESH_MS);

describe("a failed refresh", () => {
  it("home: the data stays with the failure line, never the setup prompt; a good refresh clears it", () => {
    cy.visit("/");
    cy.contains("Avg Response Time", { timeout: 15000 }).should("be.visible");
    cy.contains("1.2s").should("be.visible");

    refresh(true);
    cy.contains("Failed to load live data.").should("be.visible");
    cy.contains("header p", STALE).should("be.visible");
    cy.contains("1.2s").should("be.visible");
    cy.contains("Avg Response Time").should("be.visible");
    cy.contains("Connect your data").should("not.exist");
    cy.contains("Set up keys").should("not.exist");

    refresh(false);
    cy.contains("Failed to load live data.").should("not.exist");
    cy.contains(STALE).should("not.exist");
    cy.contains("1.2s").should("be.visible");
  });

  it("home: a failed first load shows an error with Retry, not the setup prompt or an endless skeleton", () => {
    down = true;
    cy.visit("/");
    cy.contains("Could not load metrics", { timeout: 15000 }).should("be.visible");
    cy.contains("Failed to load live data.").should("be.visible");
    cy.contains("Connect your data").should("not.exist");
    cy.contains("Set up keys").should("not.exist");
    cy.then(() => { down = false; });
    cy.contains("button", "Retry").click();
    cy.contains("Avg Response Time").should("be.visible");
  });

  it("performance: a failed refresh keeps the numbers and shows the line in the header; a later good one removes it", () => {
    cy.visit("/performance");
    cy.contains("FAKE Blog", { timeout: 15000 }).should("be.visible");
    cy.contains("header p", "1 of 1 pages reporting").should("be.visible");
    cy.contains(STALE).should("not.exist");

    refresh(true);
    cy.contains("header p", STALE).should("be.visible");
    cy.contains("header p", "1 of 1 pages reporting").should("be.visible");
    cy.contains("FAKE Blog").should("be.visible");
    cy.contains("1.2s").should("be.visible");
    cy.contains("Could not load metrics").should("not.exist");

    refresh(false);
    cy.contains(STALE).should("not.exist");
    cy.contains("FAKE Blog").should("be.visible");
  });
});
