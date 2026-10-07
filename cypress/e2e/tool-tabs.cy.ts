export {}; // make this file a module so top-level names do not clash across specs
// tool-tabs-by-key section 11 D, with the API stubbed (FAKE fixtures only):
// a one-tool install never shows the other tool; a two-tool install is unchanged.
const nr = { loadTime: 1200, lcp: 2.1, ttfb: 0.4, cls: 0.05, fid: 20, errorRate: 0.2, throughput: 40, apdexScore: 0.95 };
const row = (withSentry: boolean) => ({
  name: "FAKE Blog", slug: "blog", url: "/blog", visitors: "40", status: "Healthy", newRelic: nr,
  ...(withSentry ? { sentry: { errorCount: 2, errorRate: 0, warningCount: 0, latestErrors: [] } } : {}),
  recordedAt: "2026-01-01T00:00:00.000Z",
});
// The sidebar reads connected tools from GET /api/setup; the pages read /api/metrics. Stub both.
const stub = (tools: string[]) => {
  cy.viewport(1440, 900); // sidebar labels are hidden at the default 1000px width
  cy.intercept("GET", "/api/setup", { configured: true, tools, keys: {} });
  cy.intercept("GET", "/api/metrics", { configured: true, tools, pages: [row(tools.includes("sentry"))], history: [] });
};

describe("fresh install, New Relic keys only", () => {
  beforeEach(() => stub(["new-relic"]));

  it("dashboard shows data and the word Sentry appears nowhere except 'Add a tool'", () => {
    ["/performance", "/performance/blog"].forEach((path) => {
      cy.visit(path);
      cy.contains("FAKE Blog").should("be.visible");
      cy.get("body").should(($b) => expect($b[0].innerText).not.to.match(/sentry/i)); // visible text, not the RSC payload
      cy.get('a[href="/tools/new-relic"]').should("exist");
      cy.get('a[href="/tools/sentry"]').should("not.exist");
      cy.get('a[href="/setup"]').should("exist"); // "Add a tool"
    });
  });

  it("setup saves one complete group: only New Relic keys are sent", () => {
    cy.intercept("POST", "/api/setup", { saved: true, results: {} }).as("save");
    cy.visit("/setup");
    cy.get("#NEWRELIC_API_KEY").type("FAKE-1");
    cy.get("#NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID").type("1234567");
    cy.contains("button", "Check and save").click();
    cy.wait("@save").its("request.body").then((b) => {
      expect(Object.keys(b).sort()).to.deep.equal(["NEWRELIC_API_KEY", "NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID"]);
    });
  });
});

describe("both tools connected: same as before", () => {
  it("shows the Sentry tab and no 'Add a tool'", () => {
    stub(["new-relic", "sentry"]);
    cy.visit("/performance");
    cy.contains("FAKE Blog").should("be.visible");
    cy.get('a[href="/tools/sentry"]').should("exist");
    cy.get('a[href="/setup"]').should("not.exist"); // no "Add a tool" when both are connected
  });
});
