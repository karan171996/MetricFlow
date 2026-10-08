export {}; // make this file a module so top-level names do not clash across specs
// C1 (capability mapping) changes nothing on screen. One visit per key set, with the API stubbed (FAKE fixtures only),
// naming the headings, column headers and tiles each screen had before. The bodies carry the old per-vendor fields and
// the new neutral ones, so this same spec also passes on the code before C1.
const at = "2026-01-01T00:00:00.000Z";
const nr = { loadTime: 1200, lcp: 2100, ttfb: 400, cls: 0.05, inp: 180, fid: 20, errorRate: 0.2, throughput: 40, apdexScore: 0.95 };
const latest = [{ title: "FAKE TypeError: x is undefined", count: 2, lastSeen: at }];
const nrMetrics = { traffic: { count: 40 }, loadTime: 1200, apdex: 0.95, vitals: { lcp: 2100, cls: 0.05, inp: 180, ttfb: 400, fid: 20 }, errorRate: 0.2 };
const errors = { count: 2, latest };
const NR_SOURCES = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic" };

const stub = (tools: string[]) => {
  const hasNr = tools.includes("new-relic");
  const hasSentry = tools.includes("sentry");
  const page = {
    name: "FAKE Blog", slug: "blog", url: "/blog", visitors: "40", status: "Healthy", recordedAt: at,
    newRelic: nr,
    ...(hasSentry ? { sentry: { errorCount: 2, errorRate: 0, warningCount: 0, latestErrors: latest } } : {}),
    metrics: { ...nrMetrics, ...(hasSentry ? { errors } : {}) },
    byTool: { "new-relic": nrMetrics, ...(hasSentry ? { sentry: { errors } } : {}) },
  };
  const sources = { ...(hasNr ? NR_SOURCES : {}), ...(hasSentry ? { errors: "sentry" } : {}) };
  const pages = hasNr ? [page] : []; // pages are listed from New Relic
  cy.viewport(1440, 900); // sidebar labels and the header subtitle are hidden at narrower widths
  cy.intercept("GET", "/api/setup", { configured: true, tools, keys: {} });
  cy.intercept("GET", "/api/metrics", { configured: true, tools, failed: [], sources, project: "fake-project", pages, history: pages.length ? [{ timestamp: at, sources, pages }] : [] });
  cy.intercept("GET", "/api/timings", { items: [] });
  cy.intercept("POST", "/api/analyze", { alerts: [], recommendations: [] });
};

const headers = (expected: string[]) => cy.get("thead th").should(($th) => expect([...$th].map((th) => th.innerText.trim())).to.deep.equal(expected));
// The first page of a run is slow on a cold server, so the wait is longer than Cypress's 4s default.
const shows = (...texts: string[]) => texts.forEach((t) => cy.contains(t, { timeout: 15000 }).should("be.visible"));
const absent = (...texts: string[]) => texts.forEach((t) => cy.contains(t).should("not.exist"));

const HOME = ["Avg Response Time", "Error Rate", "Throughput", "Apdex Score", "TTFB", "LCP", "CLS", "Core Web Vitals Score Trend", "Pages Passing Core Web Vitals", "Pages Within Load Budget"];
const NR_TAB = ["Page Name", "Path", "Load", "LCP", "TTFB", "CLS", "INP", "Error Rate", "Throughput", "Apdex"];

describe("both tools connected", () => {
  beforeEach(() => stub(["new-relic", "sentry"]));

  it("home, hub, detail and both tool tabs show what they showed before", () => {
    cy.visit("/");
    shows(...HOME, "1.2s", "0.20%", "0.0k/s", "0.95");
    cy.contains("header p", "1 of 1 pages reporting · 40 views in 24h · 2 open errors").should("be.visible");

    cy.visit("/performance");
    shows("Pages Reporting", "1 of 1", "Avg Load Time", "Open Errors");
    headers(["Page Name", "Path", "Visitors (24h)", "Avg Load", "Errors", "Status"]);
    cy.get("tbody tr").should(($tr) => expect([...$tr[0].children].map((td) => (td as HTMLElement).innerText.trim())).to.deep.equal(["FAKE Blog", "/blog", "40", "1.2s", "2", "Healthy"]));
    cy.get('[data-slot="alert"]').should("not.exist");

    cy.visit("/performance/blog");
    shows("Average Load Time", "Error Rate", "0.20%", "Traffic Volume", "Related Errors", "FAKE TypeError: x is undefined");

    cy.visit("/tools/new-relic");
    shows("Avg Load Time", "Avg LCP", "Avg TTFB", "Avg Apdex", "New Relic by Page");
    headers(NR_TAB);

    cy.visit("/tools/sentry");
    shows("Total Errors", "Pages With Errors", "1 of 1", "Noisiest Page", "Sentry by Page");
    headers(["Page Name", "Path", "Errors", "Latest Error", "Last Seen"]);
  });
});

describe("New Relic keys only", () => {
  beforeEach(() => stub(["new-relic"]));

  it("the same screens without the error parts", () => {
    cy.visit("/");
    shows(...HOME);
    cy.contains("header p", "1 of 1 pages reporting · 40 views in 24h").should("be.visible").and("not.contain", "error");

    cy.visit("/performance");
    shows("Pages Reporting", "Avg Load Time");
    absent("Open Errors");
    headers(["Page Name", "Path", "Visitors (24h)", "Avg Load", "Status"]);

    cy.visit("/performance/blog");
    shows("Average Load Time", "Error Rate", "Traffic Volume");
    absent("Related Errors");

    cy.visit("/tools/new-relic");
    headers(NR_TAB);
  });
});

describe("Sentry keys only", () => {
  beforeEach(() => stub(["sentry"]));

  it("every screen is still the 'add New Relic' state", () => {
    ["/", "/performance", "/performance/blog", "/tools/sentry"].forEach((path) => {
      cy.visit(path);
      shows("Sentry is connected");
      cy.get('a[href="/setup#new-relic"]').should("be.visible").and("contain", "Add New Relic keys");
      cy.contains("header p", "Sentry connected · add New Relic to list pages").should("be.visible");
      absent("0ms", "Healthy", "Avg Load Time", "Avg Response Time");
      cy.get("thead").should("not.exist");
    });
  });
});
