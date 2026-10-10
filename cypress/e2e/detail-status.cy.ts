export {}; // make this file a module so top-level names do not clash across specs
// The page detail view: status badge, the reason sentence, and the limits on the KPI cards. The API is stubbed (FAKE fixtures only),
// /api/settings included, so the run never reads or writes a real settings file.
const at = "2026-01-01T00:00:00.000Z";
const NR = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic", errors: "sentry" };
const SENTRY = { pages: "sentry", traffic: "sentry", vitals: "sentry", errors: "sentry" };
const DEFAULTS = { loadSeconds: 1.5, errorPercent: 2, apdexMin: 0.9, uptimeSLA: 99.9 };

type Page = { name: string; slug: string; url: string; visitors: string; status: string; recordedAt: string; metrics: object; byTool: object };
// The status sent is deliberately wrong: the screen must judge the numbers itself.
const raw = (slug: string, metrics: object, visitors = "40"): Page =>
  ({ name: `FAKE ${slug}`, slug, url: `/${slug}`, visitors, status: "Healthy", recordedAt: at, metrics, byTool: { "new-relic": metrics } });
const pg = (slug: string, m: { loadTime?: number; errorRate?: number; apdex?: number } = {}) =>
  raw(slug, { traffic: { count: 40 }, loadTime: 300, errorRate: 0.1, apdex: 1, ...m, errors: { count: 2, latest: [] } });

const open = (path: string, pages: Page[], opts: { tools?: string[]; sources?: object; width?: number } = {}) => {
  const { tools = ["new-relic", "sentry"], sources = NR, width = 1440 } = opts;
  cy.viewport(width, 900);
  cy.intercept("GET", "/api/setup", { configured: true, tools, keys: {} });
  cy.intercept("GET", "/api/metrics", { configured: true, tools, failed: [], sources, project: "fake-project", pages, history: [{ timestamp: at, sources, pages }], timestamp: at });
  cy.intercept("GET", "/api/timings", { items: [] });
  cy.intercept("POST", "/api/analyze", { alerts: [], recommendations: [] });
  cy.intercept("GET", "/api/settings", DEFAULTS);
  cy.visit(path);
};
const SLOW = { timeout: 15000 };
const block = () => cy.get('section[aria-labelledby="page-status-title"]', SLOW);
const card = (label: string) => cy.contains('[data-slot="card"]', label, SLOW);

it("a Critical page → the badge, the reasons, and each limit on its KPI card", () => {
  open("/performance/crit", [pg("crit", { loadTime: 3100, errorRate: 4.2, apdex: 0.85 })]);
  block().find('[data-slot="badge"]').should("have.attr", "data-status", "Critical");
  block().find("h2").should("have.text", "Status");
  block().find('[data-slot="status-sentence"]').should("have.text", "Over a limit: error rate 4.20% (limit 2%), load time 3.1s (limit 1.5s), Apdex 0.85 (min 0.9).");
  block().contains("a", "Edit limits").should("have.attr", "href", "/settings?tab=thresholds");
  card("Average Load Time").should("contain", "limit 1.5s").find("[data-over-limit]").should("contain", "3.1s").and("contain", "over limit");
  card("Error Rate").should("contain", "limit 2%").find("[data-over-limit]").should("contain", "over limit");
  card("Apdex").should("contain", "min 0.9").find("[data-over-limit]").should("contain", "over limit");
  card("Traffic Volume").find("[data-over-limit]").should("not.exist");
});

it("a healthy page → 'Within your limits.' and no over-limit marks", () => {
  open("/performance/ok", [pg("ok")]);
  block().find('[data-slot="badge"]').should("have.attr", "data-status", "Healthy");
  block().find('[data-slot="status-sentence"]').should("have.text", "Within your limits.");
  card("Average Load Time").should("contain", "limit 1.5s").and("contain", "300ms");
  cy.get("[data-over-limit]").should("not.exist");
});

it("the zero-row page (Sentry errors, no New Relic row) → 'No performance data', dashes, no breach", () => {
  const zero = raw("zero", { loadTime: 0, errorRate: 0, apdex: 0, traffic: { count: 0 }, errors: { count: 3, latest: [] } }, "0");
  open("/performance/zero", [zero]);
  block().find('[data-slot="badge"]').should("have.attr", "data-status", "No performance data");
  block().find('[data-slot="status-sentence"]').should("have.text", "No performance data from New Relic for this page yet.");
  card("Average Load Time").should("contain", "—").and("not.contain", "0ms");
  cy.get("[data-over-limit]").should("not.exist");
  cy.contains(/Warning|Critical|Healthy/).should("not.exist");
});

it("a Sentry-only page → no performance cards and no performance limits", () => {
  const p = raw("blog", { traffic: { count: 9 }, errors: { count: 2, latest: [] } }, "9");
  open("/performance/blog", [p], { tools: ["sentry"], sources: SENTRY });
  block().find('[data-slot="badge"]').should("have.attr", "data-status", "No performance data");
  cy.contains("Related Errors", SLOW).should("be.visible");
  cy.contains(/limit 1\.5s|limit 2%|min 0\.9|Average Load Time|Error Rate|Apdex/).should("not.exist");
});

it("390px wide → no horizontal page scroll", () => {
  open("/performance/crit", [pg("crit", { loadTime: 3100, errorRate: 4.2, apdex: 0.85 })], { width: 390 });
  block();
  cy.document().should((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth));
});
