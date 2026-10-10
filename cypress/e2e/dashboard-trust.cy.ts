export {}; // make this file a module so top-level names do not clash across specs
// The home dashboard never shows something it does not know: no invented AI suggestions when the analysis is
// unavailable, and no delta (arrow, "0ms", "0.00") when there is no earlier snapshot to compare with.
// The API is stubbed (FAKE fixtures only) in the shape /api/metrics and /api/analyze send.
const at = "2026-01-01T00:00:00.000Z";
const earlier = "2025-12-31T23:59:30.000Z";
const sources = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic" };
const pageWith = (vitals: { ttfb: number; lcp: number; cls: number }, recordedAt: string) => {
  const metrics = { traffic: { count: 40 }, loadTime: 1200, apdex: 0.95, vitals: { inp: 180, fid: 20, ...vitals }, errorRate: 0.2 };
  return { name: "FAKE Blog", slug: "blog", url: "/blog", visitors: "40", status: "Healthy", recordedAt, metrics, byTool: { "new-relic": metrics } };
};
const now = pageWith({ ttfb: 400, lcp: 2100, cls: 0.05 }, at);
// TTFB was slower, LCP was faster and CLS was the same.
const before = pageWith({ ttfb: 500, lcp: 2000, cls: 0.05 }, earlier);

const GREEN = "rgb(16, 185, 129)"; // the dash-success status token
const RED = "rgb(239, 68, 68)";
const ARROWS = "svg.lucide-arrow-up, svg.lucide-arrow-down";
const STAMP = "dashboard:lastAnalyzedAt";
const SUBTITLE = "Insights generated for all tracked pages";

type Reply = { statusCode?: number; body: object };
const visitHome = (history: { timestamp: string; pages: object[] }[], analyze: Reply) => {
  cy.viewport(1440, 900); // sidebar labels and the header subtitle are hidden at narrower widths
  cy.intercept("GET", "/api/setup", { configured: true, tools: ["new-relic"], keys: {} });
  cy.intercept("GET", "/api/metrics", { configured: true, tools: ["new-relic"], failed: [], sources, project: "fake-project", pages: [now], history: history.map((h) => ({ ...h, sources })), timestamp: at }).as("metrics");
  cy.intercept("GET", "/api/timings", { items: [] });
  cy.intercept("POST", "/api/analyze", analyze).as("analyze");
  cy.visit("/");
  cy.wait("@analyze");
};
const OK: Reply = { body: { alerts: [], recommendations: [] } };
// The first page of a run is slow on a cold server, so the wait is longer than Cypress's 4s default.
const card = (text: string) => cy.contains("[data-slot=card]", text, { timeout: 15000 });
const stamp = () => cy.window().then((win) => win.localStorage.getItem(STAMP));

describe("AI suggestions card", () => {
  it("a real reply → the suggestions as rows, with the subtitle, and the day's run is recorded", () => {
    visitHome([{ timestamp: at, pages: [now] }], { body: { status: "ok", alerts: [{ severity: "high", page: "FAKE Blog", message: "FAKE: LCP is slow on this page", metric: "lcp" }], recommendations: ["FAKE: compress the hero image"] } });
    card("AI Suggestions").within(() => {
      cy.contains(SUBTITLE).should("be.visible");
      cy.get("li").should("have.length", 2);
      cy.contains("li", "FAKE: LCP is slow on this page").should("be.visible");
      cy.contains("li", "FAKE: compress the hero image").should("be.visible");
      cy.get('a[href="/setup"]').should("not.exist");
    });
    stamp().should("not.equal", null);
  });

  it("no AI key → one line saying it is off and a link to setup, no rows, no subtitle", () => {
    visitHome([{ timestamp: at, pages: [now] }], { body: { status: "unavailable", reason: "no_key" } });
    card("AI Suggestions").within(() => {
      cy.contains("AI suggestions are off. Add an AI key to turn them on.").should("be.visible");
      cy.contains('a[href="/setup"]', "Open setup").should("be.visible");
      cy.get("li").should("not.exist");
      cy.contains(SUBTITLE).should("not.exist");
      cy.contains("No suggestions yet").should("not.exist");
      cy.contains("could not be loaded").should("not.exist");
    });
    stamp().should("equal", null); // nothing ran, so the next load asks again
  });

  const FAILURES: [string, Reply][] = [
    ["the provider failed", { body: { status: "unavailable", reason: "provider_error" } }],
    ["the provider's answer was unusable", { body: { status: "unavailable", reason: "bad_response" } }],
    ["/api/analyze answered 500", { statusCode: 500, body: { error: "FAKE failure" } }],
  ];
  FAILURES.forEach(([name, reply]) => {
    it(`${name} → one line saying it could not be loaded and a link to setup, no rows`, () => {
      visitHome([{ timestamp: at, pages: [now] }], reply);
      card("AI Suggestions").within(() => {
        cy.contains("AI suggestions could not be loaded. Reload to try again, or check your AI key.").should("be.visible");
        cy.contains('a[href="/setup"]', "Open setup").should("be.visible");
        cy.get("li").should("not.exist");
        cy.contains(SUBTITLE).should("not.exist");
        cy.contains("AI suggestions are off").should("not.exist");
      });
      stamp().should("equal", null);
      // The rest of the dashboard is untouched by the failure.
      cy.contains("Avg Page Load Time").should("be.visible");
      cy.get('div[role="status"]:not(.recharts-default-tooltip)').should("not.exist"); // no stale-data strip
      cy.get('tbody tr[data-slug="blog"]').should("be.visible");
    });
  });
});

// A failed analysis call is tried again on the next page load, not on each 30s refresh. A missing key costs no
// call, so it is checked again on each refresh. Only the refresh timers are faked, as in refresh-failure.cy.ts.
describe("asking for the analysis again on the 30s refresh", () => {
  const READERS = 2; // the screen and the header each read /api/metrics
  const allRead = () => { for (let i = 0; i < READERS; i++) cy.wait("@metrics"); };
  const loadThenRefresh = (reason: string) => {
    cy.clock(Date.parse(at), ["setInterval", "clearInterval"]);
    visitHome([{ timestamp: at, pages: [now] }], { body: { status: "unavailable", reason } });
    allRead();
    // The first load is over only once the card shows its answer; a tick before that overlaps two loads.
    card("AI Suggestions").contains(reason === "no_key" ? "AI suggestions are off." : "AI suggestions could not be loaded.").should("be.visible");
    cy.get("@analyze.all").should("have.length", 1);
    cy.tick(30000);
    allRead(); // the refresh really ran: every reader asked for the metrics a second time
    cy.get("@metrics.all").should("have.length", 2 * READERS);
  };

  ["provider_error", "bad_response"].forEach((reason) => {
    it(`${reason} → the refresh does not ask again`, () => {
      loadThenRefresh(reason);
      cy.wait(1000); // real time: the refresh has long since passed the point where it would ask
      cy.get("@analyze.all").should("have.length", 1);
      card("AI Suggestions").contains("AI suggestions could not be loaded.").should("be.visible");
    });
  });

  it("no_key → the refresh asks again", () => {
    loadThenRefresh("no_key");
    cy.get("@analyze.all").should("have.length", 2);
    card("AI Suggestions").contains("AI suggestions are off.").should("be.visible");
  });
});

describe("deltas on the home dashboard", () => {
  const VITALS = [["Time to First Byte", "400ms"], ["Largest Contentful Paint", "2.1s"], ["Cumulative Layout Shift", "0.05"]];

  it("first load, one snapshot → the vitals and the breakdown say 'No prior data yet', with no arrow and no zero delta", () => {
    visitHome([{ timestamp: at, pages: [now] }], OK);
    VITALS.forEach(([description, value]) => {
      card(description).should(($card) => {
        expect($card.text()).to.contain(value).and.to.contain("No prior data yet");
        expect($card.text()).not.to.match(/\b0ms|0\.00|No change/);
        expect($card.find(ARROWS)).to.have.length(0);
      });
      card(description).contains("span", "No prior data yet").parent().should("not.have.css", "color", GREEN).and("not.have.css", "color", RED);
    });
    card("Avg Apdex (x100)").should(($card) => {
      // The headline and both rows ("Pages with Apdex 0.9 or higher", "Pages Within Load Budget (1.5s)"; both name the user's limit).
      expect($card.text().split("No prior data yet")).to.have.length(4);
      expect($card.find(ARROWS)).to.have.length(0);
    });
  });

  it("an empty history → the same, nothing to compare with", () => {
    visitHome([], OK);
    VITALS.forEach(([description]) => card(description).should(($card) => {
      expect($card.text()).to.contain("No prior data yet");
      expect($card.text()).not.to.match(/\b0ms|0\.00/);
      expect($card.find(ARROWS)).to.have.length(0);
    }));
  });

  it("a second snapshot → a decrease is a green down arrow, an increase a red up arrow, no change is 'No change' with no arrow", () => {
    visitHome([{ timestamp: earlier, pages: [before] }, { timestamp: at, pages: [now] }], OK);
    card("Time to First Byte").within(() => {
      cy.contains("span", /^100ms$/).parent().should("have.css", "color", GREEN);
      cy.get("svg.lucide-arrow-down").should("be.visible");
      cy.get("svg.lucide-arrow-up").should("not.exist");
    });
    card("Largest Contentful Paint").within(() => {
      cy.contains("span", /^100ms$/).parent().should("have.css", "color", RED);
      cy.get("svg.lucide-arrow-up").should("be.visible");
      cy.get("svg.lucide-arrow-down").should("not.exist");
    });
    card("Cumulative Layout Shift").should(($card) => {
      expect($card.text()).to.contain("No change");
      expect($card.text()).not.to.match(/0\.00|No prior data yet/);
      expect($card.find(ARROWS)).to.have.length(0);
    });
    card("Avg Apdex (x100)").should(($card) => {
      expect($card.text()).to.contain("No change").and.not.to.contain("No prior data yet");
      expect($card.find(ARROWS)).to.have.length(0);
    });
  });
});
