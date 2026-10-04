export {}; // make this file a module so top-level names do not clash across specs
// /performance states with /api/metrics stubbed. All values are fake test fixtures.
const nr = (o = {}) => ({ loadTime: 0, lcp: 0, ttfb: 0, cls: 0, fid: 0, errorRate: 0, throughput: 0, apdexScore: 0, ...o });
const page = (slug: string, o: { nr?: object; errors?: object[] } = {}) => ({
  name: `FAKE ${slug}`, slug, url: `/${slug}`, visitors: "0", status: "healthy",
  newRelic: nr(o.nr),
  sentry: { errorCount: o.errors?.length ?? 0, errorRate: 0, warningCount: 0, latestErrors: o.errors ?? [] },
  recordedAt: "2026-01-01T00:00:00.000Z",
});
const stub = (body: object, statusCode = 200) => cy.intercept("GET", "/api/metrics", { statusCode, body }).as("metrics");

describe("/performance states", () => {
  it("no keys configured: setup prompt linking to /setup, no numbers", () => {
    stub({ configured: false, pages: [] });
    cy.visit("/performance");
    cy.get('a[href="/setup"]').should("be.visible"); // wording may change; the link to /setup is the contract
    cy.contains(/\b0ms\b|Healthy/).should("not.exist");
  });

  it("configured but no pages: 'No data yet' linking to /connect", () => {
    stub({ configured: true, pages: [] });
    cy.visit("/performance");
    cy.contains("No data yet").should("be.visible");
    cy.get('a[href="/connect"]').should("be.visible");
  });

  it("pages that never reported show 'No data yet', not 0ms or Healthy", () => {
    stub({ configured: true, pages: [page("quiet")] });
    cy.visit("/performance");
    cy.contains("No data yet").should("be.visible");
    cy.contains(/\b0ms\b|Healthy/).should("not.exist");
  });

  it("API failure: one error banner, Retry refetches and recovers", () => {
    stub({ error: "FAKE upstream down" }, 500);
    cy.visit("/performance");
    cy.contains("Could not load metrics").should("be.visible");
    cy.contains("FAKE upstream down").should("be.visible");
    stub({ configured: true, pages: [page("blog", { nr: { loadTime: 1200, throughput: 5 } })] });
    cy.contains("button", "Retry").click();
    cy.contains("button", "Retry").should("not.exist"); // not the banner text: the header subtitle shows the same error and has its own fetch
    cy.contains("FAKE blog").should("be.visible");
  });

  it("row click opens that page's detail", () => {
    stub({ configured: true, pages: [page("blog", { nr: { loadTime: 1200, throughput: 5 } }), page("docs", { nr: { loadTime: 700, throughput: 9 } })] });
    cy.visit("/performance");
    cy.contains("FAKE docs").click();
    cy.location("pathname").should("eq", "/performance/docs");
    cy.contains("FAKE docs").should("be.visible");
    cy.contains("FAKE blog").should("not.exist");
  });
});

describe("/performance/[slug]", () => {
  it("unknown slug gives not-found", () => {
    stub({ configured: true, pages: [page("blog", { nr: { loadTime: 1, throughput: 1 } })] });
    cy.visit("/performance/nope", { failOnStatusCode: false });
    cy.contains(/404|not found/i).should("be.visible");
  });

  it("known page with no data: empty state naming the page", () => {
    stub({ configured: true, pages: [page("quiet")] });
    cy.visit("/performance/quiet");
    cy.contains("FAKE quiet").should("be.visible"); // names the page
    cy.get('a[href="/connect"]').should("be.visible");
    cy.contains(/\b0ms\b|Healthy/).should("not.exist");
  });

  it("detail error: banner with Retry", () => {
    stub({ error: "FAKE boom" }, 500);
    cy.visit("/performance/blog");
    cy.contains("Could not load metrics").should("be.visible");
    cy.contains("button", "Retry").should("be.visible");
  });
});
