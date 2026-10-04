export {}; // make this file a module so top-level names do not clash across specs
// Phase 0 fresh-install flow, end to end with New Relic/Sentry stubbed:
// no keys -> /setup -> keys saved -> empty state -> /connect test event -> data appears.
const nr = { loadTime: 1200, lcp: 2.1, ttfb: 0.4, cls: 0.05, fid: 20, errorRate: 0.2, throughput: 40, apdexScore: 0.95 };
const pageRow = { name: "FAKE Blog", slug: "blog", url: "/blog", visitors: "40", status: "Healthy", newRelic: nr, sentry: { errorCount: 0, errorRate: 0, warningCount: 0, latestErrors: [] }, recordedAt: "2026-01-01T00:00:00.000Z" };
const src = (recent: number) => ({ recent, lastEventAt: recent ? new Date().toISOString() : null });

it("fresh install: setup prompt -> save keys -> empty state -> test event -> data", () => {
  let configured = false, hasData = false, eventSent = false;
  cy.intercept("GET", "/api/metrics", (req) => req.reply({ configured, pages: hasData ? [pageRow] : [], history: [] }));
  cy.intercept("GET", "/api/setup", (req) => req.reply({ configured, keys: {} }));
  cy.intercept("POST", "/api/setup", (req) => { configured = true; req.reply({ saved: true, results: {} }); });
  cy.intercept("GET", "/api/connect", (req) => req.reply({ configured, insertKeySet: true, browser: src(0), custom: src(eventSent ? 1 : 0), sentry: src(0) }));
  cy.intercept("POST", "/api/connect", (req) => { eventSent = true; hasData = true; req.reply({ sent: true }); });

  cy.visit("/performance");
  cy.get('a[href="/setup"]').should("be.visible"); // no fake numbers
  cy.contains(/\b0ms\b|Healthy/).should("not.exist");
  cy.get('a[href="/setup"]').first().click();
  cy.location("pathname").should("eq", "/setup");

  ["NEWRELIC_API_KEY", "NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID", "SENTRY_API_KEY"].forEach((k) => cy.get(`#${k}`).type("FAKE-1"));
  cy.get("#SENTRY_DSN").type("https://fakekey@o1.ingest.sentry.io/1");
  cy.contains("button", "Check and save").click();
  cy.contains("No restart needed").should("be.visible");

  cy.visit("/performance");
  cy.contains("No data yet").should("be.visible"); // configured, nothing reported
  cy.get('a[href="/connect"]').first().click();
  cy.location("pathname").should("eq", "/connect");
  cy.contains("None yet").should("be.visible");

  cy.contains("button", "Send test event").click();
  cy.contains("Test event sent").should("be.visible");
  cy.contains("Receiving data", { timeout: 15000 }).should("be.visible");

  cy.visit("/performance");
  cy.contains("FAKE Blog").should("be.visible");
});
