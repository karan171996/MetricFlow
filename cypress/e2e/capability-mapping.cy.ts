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
  // Beside New Relic, Sentry supplies only errors. Alone, it lists the pages and supplies sampled traffic and vitals too.
  const sources = { ...(hasNr ? NR_SOURCES : hasSentry ? { pages: "sentry", traffic: "sentry", vitals: "sentry" } : {}), ...(hasSentry ? { errors: "sentry" } : {}) };
  const pages = hasNr ? [page] : []; // Sentry-only here has sent nothing yet (cypress/e2e/sentry-only.cy.ts covers it with data)
  cy.viewport(1440, 900); // sidebar labels and the header subtitle are hidden at narrower widths
  cy.intercept("GET", "/api/setup", { configured: true, tools, keys: {} });
  cy.intercept("GET", "/api/metrics", { configured: true, tools, failed: [], sources, project: "fake-project", pages, history: pages.length ? [{ timestamp: at, sources, pages }] : [] });
  cy.intercept("GET", "/api/timings", { items: [] });
  cy.intercept("POST", "/api/analyze", { alerts: [], recommendations: [] });
};

const headers = (expected: string[]) => cy.get("thead th").should(($th) => expect([...$th].map((th) => th.innerText.replace(/\s+/g, " ").trim())).to.deep.equal(expected));
/** A row of the page table: the page's name (its link's title), then each cell as shown at 1440. */
const pageRow = (slug: string, expected: string[]) => cy.get(`tbody tr[data-slug="${slug}"]`, { timeout: 15000 }).should(($tr) =>
  expect([$tr.find("th a").attr("title"), ...[...$tr.find("td")].map((td) => td.innerText.trim())]).to.deep.equal(expected));
// The first page of a run is slow on a cold server, so the wait is longer than Cypress's 4s default.
const shows = (...texts: string[]) => texts.forEach((t) => cy.contains(t, { timeout: 15000 }).should("be.visible"));
const absent = (...texts: string[]) => texts.forEach((t) => cy.contains(t).should("not.exist"));

const HOME = ["Avg Page Load Time", "Error Rate", "Page views (24h)", "Apdex Score", "TTFB", "LCP", "CLS", "Apdex Trend", "Avg Apdex (x100)", "Pages with Apdex 0.9 or higher", "Pages Within Load Budget"];
const NR_TAB = ["Page Name", "Path", "Load", "LCP", "TTFB", "CLS", "INP", "Error Rate", "Throughput", "Apdex"];

describe("both tools connected", () => {
  beforeEach(() => stub(["new-relic", "sentry"]));

  it("home, hub, detail and both tool tabs show what they showed before", () => {
    cy.visit("/");
    shows(...HOME);
    // The values: in the "Fix first" table (at 1440 the small-screen line holding the same numbers is hidden).
    pageRow("blog", ["FAKE Blog", "Healthy", "1.2s", "0.20%", "0.95", "2", "40"]);
    // The raw 24h count (one page, traffic.count 40), not a rate. Read from its own tile: "40" alone also matches the header.
    cy.contains("Page views (24h)").parent().should("contain", "40").and("not.contain", "k/s");
    cy.contains("header p", "1 of 1 pages reporting · 40 views in 24h · 2 open errors").should("be.visible");

    cy.visit("/performance");
    shows("Pages Reporting", "1 of 1", "Avg Load Time", "Open Errors");
    headers(["Page", "Status", "Load time limit 1.5s", "Error rate limit 2%", "Apdex min 0.9", "Sentry errors last 24h, no limit", "Views (24h)"]);
    pageRow("blog", ["FAKE Blog", "Healthy", "1.2s", "0.20%", "0.95", "2", "40"]);
    cy.get('[data-slot="alert"]').should("not.exist");

    cy.visit("/performance/blog");
    shows("Average Load Time", "Error Rate", "0.20%", "Traffic Volume", "Related Errors", "FAKE TypeError: x is undefined");

    cy.visit("/tools/new-relic");
    shows("Avg Load Time", "Avg LCP", "Avg TTFB", "Avg Apdex", "New Relic by Page");
    headers(NR_TAB);

    cy.visit("/tools/sentry");
    shows("Total Errors", "Pages With Errors", "1 of 1", "Noisiest Page", "Sentry by Page");
    // The tab also shows Sentry's own page loads and vitals, from tracing.
    headers(["Page Name", "Path", "Errors", "Latest Error", "Last Seen", "Page loads (sampled)", "LCP", "TTFB", "CLS", "INP"]);
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
    headers(["Page", "Status", "Load time limit 1.5s", "Error rate limit 2%", "Apdex min 0.9", "Views (24h)"]);
    pageRow("blog", ["FAKE Blog", "Healthy", "1.2s", "0.20%", "0.95", "40"]);

    cy.visit("/performance/blog");
    shows("Average Load Time", "Error Rate", "Traffic Volume");
    absent("Related Errors");

    cy.visit("/tools/new-relic");
    headers(NR_TAB);
  });
});

describe("Sentry keys only", () => {
  beforeEach(() => stub(["sentry"]));

  it("nothing sent yet → every screen says 'No data yet' and points to Connect, with no zeros", () => {
    ["/", "/performance", "/performance/blog", "/tools/sentry"].forEach((path) => {
      cy.visit(path);
      shows("No data yet");
      cy.get('a[href="/connect"]').should("be.visible");
      // Sentry lists pages itself now, so nothing asks for New Relic keys.
      // "0ms" stays: it is formatDuration(0), what a tile or table cell drawn from no data would read (not only the old vitals delta).
      absent("Sentry is connected", "Add New Relic keys", "0ms", "Healthy", "Avg Load Time", "Avg Page Load Time", "Page views (24h)");
      cy.get("thead").should("not.exist");
    });
  });
});
