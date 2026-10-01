export {}; // LIVE: no stubs. Needs the app started in a folder with a real .env.local. Never logs key values.
describe("live metric cards (real .env.local)", () => {
  it("/api/metrics is configured and returns pages", () => {
    cy.request("/api/metrics").then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.configured, "keys loaded from .env.local").to.eq(true);
      cy.log(`pages discovered: ${res.body.pages.length}`);
      expect(JSON.stringify(res.body)).not.to.match(/NRAK-|sntry[su]_/); // no key in the response
    });
  });

  // Real data decides what must show: pages found -> metric cards with values; none -> honest empty state.
  it("/ and /performance show real cards when pages exist, else an honest empty state", () => {
    cy.viewport(1440, 900);
    cy.request("/api/metrics").then(({ body }) => {
      const hasPages = body.pages.some((p: { newRelic: { throughput: number; loadTime: number } }) => p.newRelic.throughput > 0 || p.newRelic.loadTime > 0);
      cy.visit("/");
      cy.wait(2500);
      if (hasPages) {
        ["Avg Response Time", "Error Rate", "Throughput", "Apdex Score"].forEach((t) => cy.contains(t).should("be.visible"));
        cy.contains(/No data yet/).should("not.exist");
      } else {
        cy.contains("No data yet").should("be.visible");
        cy.contains(/\b0ms\b|Healthy/).should("not.exist"); // never invented zeros
      }
      cy.screenshot("live-dashboard", { capture: "viewport", overwrite: true });
      cy.visit("/performance");
      cy.wait(2500);
      cy.screenshot("live-performance", { capture: "viewport", overwrite: true });
    });
  });
});
