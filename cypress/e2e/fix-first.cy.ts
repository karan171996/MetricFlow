export {}; // make this file a module so top-level names do not clash across specs
// Piece 3: the "Fix first" page table and the inline breach banner on home. The API is stubbed (FAKE fixtures only),
// /api/settings included, so the run never reads or writes a real settings file.
const at = "2026-01-01T00:00:00.000Z";
const SOURCES = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic", errors: "sentry" };
const DEFAULTS = { loadSeconds: 1.5, errorPercent: 2, apdexMin: 0.9, uptimeSLA: 99.9 };
const VITALS = { lcp: 2100, cls: 0.05, inp: 180, ttfb: 400, fid: 20 };

type Page = { name: string; slug: string; url: string; visitors: string; status: string; recordedAt: string; metrics: object; byTool: object };
// The status sent is deliberately wrong: the screen must judge the numbers itself.
const raw = (slug: string, metrics: object, visitors = "40"): Page =>
  ({ name: `FAKE ${slug}`, slug, url: `/${slug}`, visitors, status: "Healthy", recordedAt: at, metrics, byTool: { "new-relic": metrics } });
/** A measured page; the defaults are inside every default limit (1.5s, 2%, Apdex 0.9). */
const pg = (slug: string, m: { loadTime?: number; errorRate?: number; apdex?: number; views?: number; errors?: number } = {}) => {
  const { views = 40, errors = 0, ...perf } = m;
  return raw(slug, { traffic: { count: views }, vitals: VITALS, loadTime: 300, errorRate: 0.1, apdex: 1, ...perf, errors: { count: errors, latest: [] } }, String(views));
};
const CRIT = pg("crit", { loadTime: 3100, errorRate: 4.2, apdex: 0.85, errors: 9 });
const OK = pg("ok");

let pagesNow: Page[];
const open = (path: string, pages: Page[], width = 1440, height = 900) => {
  pagesNow = pages;
  cy.viewport(width, height);
  cy.intercept("GET", "/api/setup", { configured: true, tools: ["new-relic", "sentry"], keys: {} });
  cy.intercept("GET", "/api/metrics", (req) => req.reply({ configured: true, tools: ["new-relic", "sentry"], failed: [], sources: SOURCES, project: "fake-project", pages: pagesNow, history: [{ timestamp: at, sources: SOURCES, pages: pagesNow }], timestamp: at }));
  cy.intercept("GET", "/api/timings", { items: [] });
  cy.intercept("POST", "/api/analyze", { alerts: [], recommendations: [] });
  cy.intercept("GET", "/api/settings", DEFAULTS);
  cy.visit(path);
};

// The first page of a run is slow on a cold server, so the wait is longer than Cypress's 4s default.
const SLOW = { timeout: 15000 };
const banner = () => cy.get('[data-slot="alert"]');
const row = (slug: string) => cy.get(`tbody tr[data-slug="${slug}"]`, SLOW);
/** The FULL list of rows, in order: rendered rows first, so an absence checked after this means something. */
const rowsAre = (expected: string[]) =>
  cy.get("tbody tr[data-slug]", SLOW).should(($tr) => expect([...$tr].map((tr) => tr.getAttribute("data-slug"))).to.deep.equal(expected));
const noPageScroll = (label: string) =>
  cy.document().should((doc) => expect(doc.documentElement.scrollWidth, `${label}: no horizontal page scroll`).to.be.at.most(doc.documentElement.clientWidth));

it("rows are ranked worst first, whatever order the pages arrive in", () => {
  // Critical, Warning, errors with no status, Healthy (closest to a limit first), no data. Equal ratios fall to Sentry errors, then traffic.
  const ranked = [
    pg("c-ratio", { loadTime: 4500 }), // Critical, ratio 3: beats the larger error counts below
    pg("c-errors", { loadTime: 3600, errors: 9, views: 10 }), // ratio 2.4 from here
    pg("c-traffic", { loadTime: 3600, errors: 5, views: 90 }),
    pg("c-name", { loadTime: 3600, errors: 5, views: 20 }),
    pg("warn", { apdex: 0.85, errors: 50 }),
    raw("np", { errors: { count: 3, latest: [] } }, "0"),
    pg("healthy-close", { loadTime: 1400 }),
    pg("healthy-far", { errors: 7 }),
    raw("quiet", { loadTime: 0, errorRate: 0, apdex: 0, traffic: { count: 0 } }, "0"),
  ];
  open("/performance", [...ranked].reverse());
  rowsAre(ranked.map((p) => p.slug));
  row("c-ratio").find('[data-slot="badge"]').should("have.attr", "data-status", "Critical");
  row("quiet").find('[data-slot="badge"]').should("have.attr", "data-status", "No data yet");
});

it("a breaching page → the banner on home, naming the page, its values and limits; none on /performance", () => {
  open("/", [OK, CRIT]);
  rowsAre(["crit", "ok"]);
  banner().should("be.visible").and("have.attr", "role", "region").and("have.attr", "aria-label", "Pages over a limit");
  banner().find('[data-slot="banner-title"]').should("have.text", "1 page is over a limit");
  banner().find('li[data-slug="crit"] > span').should("have.text", "Critical · FAKE crit: error rate 4.20% (limit 2%), load time 3.1s (limit 1.5s), Apdex 0.85 (min 0.9)");
  banner().find('li[data-slug="crit"] a').should("have.attr", "href", "/performance/crit");
  banner().should(($b) => expect($b.text()).not.to.match(/adjust|loosen|threshold exceeded/i));

  cy.visit("/performance");
  rowsAre(["crit", "ok"]);
  row("crit").find('[data-slot="badge"]').should("have.attr", "data-status", "Critical"); // the same breach, judged here too
  banner().should("not.exist");
});

it("Dismiss hides the banner, moves focus to the table heading, and it stays hidden after a reload", () => {
  open("/", [CRIT, OK]);
  rowsAre(["crit", "ok"]);
  banner().should("be.visible");
  cy.contains('[data-slot="banner-actions"] button', "Dismiss").click();
  banner().should("not.exist");
  cy.focused().should("have.id", "pages-table-title").and("have.text", "Fix first");

  cy.reload();
  rowsAre(["crit", "ok"]);
  row("crit").find('[data-slot="badge"]').should("have.attr", "data-status", "Critical");
  banner().should("not.exist");
});

it("the real zero-row shape (Sentry errors, no New Relic row) → 'No performance data' and dashes, never a breach", () => {
  // What the route sends for a page New Relic has no row for: zeros, not missing fields. Apdex 0 must not read as a breach.
  const zero = raw("zero", { loadTime: 0, errorRate: 0, apdex: 0, traffic: { count: 0 }, vitals: { lcp: 0, cls: 0, inp: 0, ttfb: 0, fid: 0 }, errors: { count: 3, latest: [] } }, "0");
  open("/", [OK, zero, CRIT]);
  rowsAre(["crit", "zero", "ok"]); // after the breach, above Healthy
  row("zero").find('[data-slot="badge"]').should("have.attr", "data-status", "No performance data");
  row("zero").find("td").should(($td) => {
    expect([...$td].slice(1, 4).map((td) => td.innerText.trim()), "load time, error rate, Apdex").to.deep.equal(["—", "—", "—"]);
    expect($td[4].innerText.trim(), "Sentry errors").to.equal("3");
  });
  row("zero").find("[data-over-limit]").should("not.exist");
  banner().find("li").should("have.length", 1).and("have.attr", "data-slug", "crit");
});

describe("390px wide", () => {
  ["/", "/performance"].forEach((path) => {
    it(`${path} → no horizontal page scroll, with a breaching row showing its reason line`, () => {
      open(path, [OK, CRIT, pg("warn", { loadTime: 2000 })], 390, 844);
      rowsAre(["crit", "warn", "ok"]);
      row("crit").find('[data-slot="row-summary"]').should("be.visible").and("contain", "Error rate 4.20% (limit 2%)");
      noPageScroll(path);
    });
  });
});
