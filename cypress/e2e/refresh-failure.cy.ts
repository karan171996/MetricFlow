export {}; // make this file a module so top-level names do not clash across specs
// A failed refresh of /api/metrics keeps the last good numbers and says so; it never turns into the setup prompt.
// The API is stubbed (FAKE fixtures only). Only the 30s refresh timers are faked, so the app itself runs normally.
const at = "2026-01-01T00:00:00.000Z";
const nrMetrics = { traffic: { count: 40 }, loadTime: 1200, apdex: 0.95, vitals: { lcp: 2100, cls: 0.05, inp: 180, ttfb: 400, fid: 20 }, errorRate: 0.2 };
const sources = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic" };
const page = { name: "FAKE Blog", slug: "blog", url: "/blog", visitors: "40", status: "Healthy", recordedAt: at, metrics: nrMetrics, byTool: { "new-relic": nrMetrics } };
const good = { configured: true, tools: ["new-relic"], failed: [], sources, project: "fake-project", pages: [page], history: [{ timestamp: at, sources, pages: [page] }], timestamp: at };

let down = false;
let analyzeDelay = 0;
let analyzeAsked = false;
const REFRESH_MS = 30000;
const STALE = "Could not load the latest data.";
// Home's strip under the header. Found by its role, never by its text: the header prints the same sentence.
// Recharts' tooltip is role="status" too.
const STRIP = 'div[role="status"]:not(.recharts-default-tooltip)';
// The time is locale-formatted, e.g. "05:30", "5:30 AM".
const STRIP_TEXT = /^Could not load the latest data\. Showing numbers from \d{1,2}[:.]\d{2}(\s?[AP]\.?M\.?)?\.(Retrying…)?$/i;
// Every screen here has two readers of /api/metrics: the screen itself and the header.
const READERS = 2;

beforeEach(() => {
  down = false;
  analyzeDelay = 0;
  analyzeAsked = false;
  cy.viewport(1440, 900); // the header subtitle is hidden at narrower widths
  cy.intercept("GET", "/api/setup", { configured: true, tools: ["new-relic"], keys: {} });
  cy.intercept("GET", "/api/timings", { items: [] }).as("timings");
  cy.intercept("POST", "/api/analyze", (req) => { analyzeAsked = true; req.reply({ delay: analyzeDelay, body: { alerts: [], recommendations: [] } }); }).as("analyze");
  cy.intercept("GET", "/api/metrics", (req) => req.reply(down ? { statusCode: 500, body: { error: "Could not load New Relic data." } } : { statusCode: 200, body: good })).as("metrics");
  cy.clock(Date.parse(at), ["setInterval", "clearInterval"]);
});
// Each reader starts its 30s interval in the same effect as its first fetch, so once every reader's response
// has arrived the intervals exist and a tick cannot fire into nothing.
const allRead = () => { for (let i = 0; i < READERS; i++) cy.wait("@metrics"); };
/** One refresh: tick the faked interval, then wait until every reader has had its answer. */
const refresh = (isDown: boolean) => {
  cy.then(() => { down = isDown; });
  cy.tick(REFRESH_MS);
  allRead();
};

describe("a failed refresh", () => {
  it("home: the data stays with the failure line, never the setup prompt; a good refresh clears it", () => {
    cy.visit("/");
    allRead();
    cy.wait("@analyze"); // the first load is only over after its last request; a tick before that overlaps two loads
    cy.contains("Avg Page Load Time", { timeout: 15000 }).should("be.visible");
    cy.contains("td", /^1\.2s$/).should("be.visible");

    refresh(true);
    cy.get(STRIP).should("be.visible").invoke("text").should("match", STRIP_TEXT);
    cy.contains("header p", STALE).should("be.visible");
    cy.contains("td", /^1\.2s$/).should("be.visible");
    cy.get('tbody tr[data-slug="blog"]').should("be.visible");
    cy.contains("Avg Page Load Time").should("be.visible");
    cy.contains("Connect your data").should("not.exist");
    cy.contains("Set up keys").should("not.exist");

    refresh(false);
    cy.wait("@timings");
    cy.get(STRIP).should("not.exist");
    cy.contains(STALE).should("not.exist");
    cy.contains("td", /^1\.2s$/).should("be.visible");
  });

  it("home: a slow load that finishes after a newer failed refresh does not hide the failure", () => {
    analyzeDelay = 1500; // the first load is still waiting for its last request when the next refresh fails
    cy.visit("/");
    allRead();
    // The first load has sent its last request and is waiting for the slow answer: only now do the two loads overlap there.
    cy.wrap(null).should(() => expect(analyzeAsked, "analyze requested").to.equal(true));
    cy.contains("Avg Page Load Time", { timeout: 15000 }).should("be.visible");

    refresh(true);
    cy.get(STRIP).should("be.visible");
    cy.wait("@analyze"); // now the older, successful load has finished
    cy.contains("header p", STALE).should("be.visible"); // gives the page a render after that
    cy.get(STRIP).should("be.visible").invoke("text").should("match", STRIP_TEXT);
    cy.contains("td", /^1\.2s$/).should("be.visible");
  });

  it("home: a failed first load shows an error with Retry, not the setup prompt or an endless skeleton", () => {
    down = true;
    cy.visit("/");
    allRead();
    cy.contains("Could not load metrics", { timeout: 15000 }).should("be.visible");
    cy.contains("Failed to load live data.").should("be.visible"); // the first-load card keeps this reason
    cy.contains("Send your first events").should("not.exist"); // Retry is the only action
    cy.contains("Connect your data").should("not.exist");
    cy.contains("Set up keys").should("not.exist");
    cy.then(() => { down = false; });
    cy.contains("button", "Retry").click();
    cy.wait("@metrics");
    cy.contains("Avg Page Load Time").should("be.visible");
  });

  it("performance: a failed refresh keeps the numbers and shows the line in the header; a later good one removes it", () => {
    cy.visit("/performance");
    allRead();
    cy.contains("FAKE Blog", { timeout: 15000 }).should("be.visible");
    cy.contains("header p", "1 of 1 pages reporting").should("be.visible");
    cy.contains(STALE).should("not.exist");

    refresh(true);
    cy.contains("header p", STALE).should("be.visible");
    cy.contains("header p", "1 of 1 pages reporting").should("be.visible");
    cy.contains("FAKE Blog").should("be.visible");
    cy.contains("td", /^1\.2s$/).should("be.visible");
    cy.contains("Could not load metrics").should("not.exist");

    refresh(false);
    cy.contains(STALE).should("not.exist");
    cy.contains("FAKE Blog").should("be.visible");
  });
});
