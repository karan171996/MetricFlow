export {}; // make this file a module so top-level names do not clash across specs
// One health rule: the KPI tiles, the breakdown counts, the page status, the table summary and the breach banner all judge a value
// against the user's thresholds (lib/thresholds.ts). The API is stubbed (FAKE fixtures only), /api/settings included,
// so the run never depends on, or writes, a real .metricflow-settings.json.
const at = "2026-01-01T00:00:00.000Z";
const sources = { pages: "new-relic", traffic: "new-relic", loadTime: "new-relic", apdex: "new-relic", vitals: "new-relic", ajax: "new-relic", errorRate: "new-relic" };
const DEFAULTS = { loadSeconds: 1.5, errorPercent: 2, apdexMin: 0.9, uptimeSLA: 99.9 };
const CLASSES = ["text-dash-success", "text-dash-warning", "text-dash-danger"];
// A Healthy value stays white: it has none of the three status colours.
const COLOUR: Record<Status, string | undefined> = { Healthy: undefined, Warning: CLASSES[1], Critical: CLASSES[2] };
type Status = "Healthy" | "Warning" | "Critical";

const page = (slug: string, m: { loadTime?: number; errorRate?: number; apdex?: number }) => {
  const metrics = { traffic: { count: 40 }, vitals: { lcp: 2100, cls: 0.05, inp: 180, ttfb: 400, fid: 20 }, ...m };
  // The status sent here is deliberately wrong for most pages: the screen must judge the numbers itself.
  return { name: `FAKE ${slug}`, slug, url: `/${slug}`, visitors: "40", status: "Healthy", recordedAt: at, metrics, byTool: { "new-relic": metrics } };
};
const stub = (pages: object[], settings: object = DEFAULTS) => {
  cy.intercept("GET", "/api/setup", { configured: true, tools: ["new-relic"], keys: {} });
  cy.intercept("GET", "/api/metrics", { configured: true, tools: ["new-relic"], failed: [], sources, project: "fake-project", pages, history: [{ timestamp: at, sources, pages }], timestamp: at });
  cy.intercept("GET", "/api/timings", { items: [] });
  cy.intercept("POST", "/api/analyze", { alerts: [], recommendations: [] });
  cy.intercept("GET", "/api/settings", settings).as("settings");
};
const visitHome = (pages: object[], settings: object = DEFAULTS) => {
  cy.viewport(1440, 900);
  stub(pages, settings);
  cy.visit("/");
  cy.wait("@settings");
};

// The first page of a run is slow on a cold server, so the wait is longer than Cypress's 4s default.
const tile = (label: string) => cy.contains("p", new RegExp(`^${label.replace(/[()]/g, "\\$&")}$`), { timeout: 15000 }).parent();
/** The tile's value, its status line and the colour of the value. */
const tileReads = (label: string, value: string, status: Status, limit: string) =>
  tile(label).should(($tile) => {
    const $value = $tile.children("p").eq(1);
    expect($value.text(), label).to.equal(`${value} ${status} · ${limit}`);
    CLASSES.forEach((c) => expect($value.hasClass(c), `${label} ${c === COLOUR[status] ? "is" : "is not"} ${c}`).to.equal(c === COLOUR[status]));
    if (status === "Healthy") expect($value.hasClass("text-dash-foreground"), `${label} is white`).to.equal(true);
    expect($value.find("span").hasClass("text-dash-muted"), "the status line is muted").to.equal(true);
  });
/** A tile with nothing to judge: the bare value, no status word, no limit and no status colour. */
const tileHasNoStatus = (label: string, value: string) =>
  tile(label).should(($tile) => {
    const $value = $tile.children("p").eq(1);
    expect($value.text(), label).to.equal(value);
    expect($tile.text()).not.to.match(/Healthy|Warning|Critical|limit|min /);
    CLASSES.forEach((c) => expect($value.hasClass(c), `${label} is not ${c}`).to.equal(false));
  });
/** A row of the breakdown card: its exact label and its count. */
const breakdown = (label: string, count: string) =>
  cy.contains("[data-slot=card] span", label, { timeout: 15000 }).should(($label) => {
    expect($label.text()).to.equal(label);
    expect($label.next().text()).to.equal(count);
  });
const alertBox = () => cy.get('[data-slot="alert"]');
/** The breach banner's line for one page: "{status} · {name}: {reasons, worst first}". */
const bannerLine = (slug: string, line: string) => alertBox().find(`li[data-slug="${slug}"] > span`).should("have.text", line);
const summary = (text: string) => cy.get('[data-slot="table-summary"]', { timeout: 15000 }).should(($p) => expect($p.text().trim()).to.equal(text));
const statusOf = (slug: string, status: string) => cy.get(`tbody tr[data-slug="${slug}"] [data-slot="badge"]`, { timeout: 15000 }).should("have.attr", "data-status", status);

describe("KPI tiles show their status and limit", () => {
  it("under every limit → Healthy with the value left white, each with its limit; Page views has no status line", () => {
    visitHome([page("blog", { loadTime: 1200, errorRate: 0.2, apdex: 0.95 })]);
    tileReads("Avg Page Load Time", "1.2s", "Healthy", "limit 1.5s");
    tileReads("Error Rate", "0.20%", "Healthy", "limit 2%");
    tileReads("Apdex Score", "0.95", "Healthy", "min 0.9");
    tileHasNoStatus("Page views (24h)", "40");
    alertBox().should("not.exist");
  });

  it("exactly at each limit → still Healthy", () => {
    visitHome([page("blog", { loadTime: 1500, errorRate: 2, apdex: 0.9 })]);
    tileReads("Avg Page Load Time", "1.5s", "Healthy", "limit 1.5s");
    tileReads("Error Rate", "2.00%", "Healthy", "limit 2%");
    tileReads("Apdex Score", "0.90", "Healthy", "min 0.9");
    alertBox().should("not.exist");
  });

  it("over the limit but not over twice it → Warning in the warning colour; Apdex under its minimum is Warning", () => {
    visitHome([page("blog", { loadTime: 2000, errorRate: 3, apdex: 0.85 })]);
    tileReads("Avg Page Load Time", "2s", "Warning", "limit 1.5s");
    tileReads("Error Rate", "3.00%", "Warning", "limit 2%");
    tileReads("Apdex Score", "0.85", "Warning", "min 0.9");
    tileHasNoStatus("Page views (24h)", "40");
    alertBox().should("have.attr", "data-severity", "warning").find('[data-slot="banner-title"]').should("have.text", "1 page is over a limit");
    bannerLine("blog", "Warning · FAKE blog: error rate 3.00% (limit 2%), load time 2s (limit 1.5s), Apdex 0.85 (min 0.9)");
    cy.contains("approaching threshold").should("not.exist");
  });

  it("exactly twice the limit → still Warning, not Critical", () => {
    visitHome([page("blog", { loadTime: 3000, errorRate: 4, apdex: 0.95 })]);
    tileReads("Avg Page Load Time", "3s", "Warning", "limit 1.5s");
    tileReads("Error Rate", "4.00%", "Warning", "limit 2%");
    bannerLine("blog", "Warning · FAKE blog: load time 3s (limit 1.5s), error rate 4.00% (limit 2%)");
    alertBox().should("have.attr", "data-severity", "warning");
  });

  it("over twice the limit → Critical in the danger colour; Apdex has no Critical step", () => {
    visitHome([page("blog", { loadTime: 3200, errorRate: 4.5, apdex: 0.3 })]);
    tileReads("Avg Page Load Time", "3.2s", "Critical", "limit 1.5s");
    tileReads("Error Rate", "4.50%", "Critical", "limit 2%");
    tileReads("Apdex Score", "0.30", "Warning", "min 0.9");
    alertBox().should("have.attr", "data-severity", "critical");
    bannerLine("blog", "Critical · FAKE blog: Apdex 0.30 (min 0.9), error rate 4.50% (limit 2%), load time 3.2s (limit 1.5s)");
  });

  it("a metric no page measured → that tile has no colour and no status line, and nothing is alerted", () => {
    visitHome([page("blog", { loadTime: 1200, apdex: 0.95 })]); // New Relic is connected but sent no error rate
    tileReads("Avg Page Load Time", "1.2s", "Healthy", "limit 1.5s");
    tileHasNoStatus("Error Rate", "0.00%");
    tileReads("Apdex Score", "0.95", "Healthy", "min 0.9");
    alertBox().should("not.exist");
  });
});

describe("one rule: tiles, breakdown counts, page status, table summary and banner agree", () => {
  const fast = page("fast", { loadTime: 1200, errorRate: 0.2, apdex: 0.95 });
  const slow = page("slow", { loadTime: 2000, errorRate: 0.2, apdex: 0.95 });

  it("1.2s is within the 1.5s budget and raises nothing; 2.0s is outside it and is the only page alerted", () => {
    visitHome([fast, slow]);
    breakdown("Pages Within Load Budget (1.5s)", "1/2");
    breakdown("Pages with Apdex 0.9 or higher", "2/2");
    tileReads("Avg Page Load Time", "1.6s", "Warning", "limit 1.5s"); // the average of the two
    summary("1 of 2 pages is over a limit.");
    statusOf("slow", "Warning");
    statusOf("fast", "Healthy");
    alertBox().find("li").should("have.length", 1);
    bannerLine("slow", "Warning · FAKE slow: load time 2s (limit 1.5s)");

    // The hub gives each page the same verdict.
    cy.visit("/performance");
    statusOf("fast", "Healthy");
    statusOf("slow", "Warning");
    summary("1 of 2 pages is over a limit.");
  });

  it("a page over only its error-rate limit → in the summary's count and Warning in the table, while both breakdown counts still pass it", () => {
    visitHome([fast, page("flaky", { loadTime: 1200, errorRate: 3, apdex: 0.95 })]);
    breakdown("Pages Within Load Budget (1.5s)", "2/2");
    breakdown("Pages with Apdex 0.9 or higher", "2/2");
    summary("1 of 2 pages is over a limit.");
    statusOf("flaky", "Warning");
    bannerLine("flaky", "Warning · FAKE flaky: error rate 3.00% (limit 2%)");
  });

  it("only the 1.2s page → counted within budget, tile Healthy, no alert", () => {
    visitHome([fast]);
    breakdown("Pages Within Load Budget (1.5s)", "1/1");
    tileReads("Avg Page Load Time", "1.2s", "Healthy", "limit 1.5s");
    alertBox().should("not.exist");
  });

  it("a page with a bad Apdex is not counted as passing and is alerted as Warning", () => {
    visitHome([fast, page("rough", { loadTime: 1200, errorRate: 0.2, apdex: 0.85 })]);
    breakdown("Pages with Apdex 0.9 or higher", "1/2");
    breakdown("Pages Within Load Budget (1.5s)", "2/2");
    statusOf("rough", "Warning");
    alertBox().find("li").should("have.length", 1);
    bannerLine("rough", "Warning · FAKE rough: Apdex 0.85 (min 0.9)");
  });
});

describe("custom thresholds", () => {
  const CUSTOM = { loadSeconds: 1, errorPercent: 2, apdexMin: 0.8, uptimeSLA: 99.9 };
  // Under the defaults: "a" would be Warning (Apdex 0.85 < 0.9) and "b" within the load budget (1.2s <= 1.5s).
  const a = page("a", { loadTime: 900, errorRate: 0.2, apdex: 0.85 });
  const b = page("b", { loadTime: 1200, errorRate: 0.2, apdex: 0.75 });

  it("load 1s and Apdex 0.8 → the labels, the counts, the tile limits and the alert all follow", () => {
    visitHome([a, b], CUSTOM);
    breakdown("Pages Within Load Budget (1s)", "1/2");
    breakdown("Pages with Apdex 0.8 or higher", "1/2");
    tileReads("Avg Page Load Time", "1.1s", "Warning", "limit 1s"); // average 1050ms
    tileReads("Error Rate", "0.20%", "Healthy", "limit 2%");
    tile("Apdex Score").should("contain", "min 0.8").and("not.contain", "min 0.9");
    cy.contains("(1.5s)").should("not.exist");
    cy.contains("Apdex 0.9 or higher").should("not.exist");
    alertBox().find("li").should("have.length", 1);
    bannerLine("b", "Warning · FAKE b: load time 1.2s (limit 1s), Apdex 0.75 (min 0.8)");
  });

  it("a looser load limit of 3s → both pages are within budget", () => {
    visitHome([a, b], { ...CUSTOM, loadSeconds: 3 });
    breakdown("Pages Within Load Budget (3s)", "2/2");
    tileReads("Avg Page Load Time", "1.1s", "Healthy", "limit 3s");
  });

  it("settings stored before apdexMin existed → the minimum is 0.9", () => {
    // loadSeconds 3 shows that this answer, not the built-in defaults, is what the screen is using.
    visitHome([a, b], { loadSeconds: 3, errorPercent: 2, uptimeSLA: 99.9 });
    tileReads("Avg Page Load Time", "1.1s", "Healthy", "limit 3s");
    tileReads("Apdex Score", "0.80", "Warning", "min 0.9");
    breakdown("Pages with Apdex 0.9 or higher", "0/2");
    alertBox().find("li").should("have.length", 2);
    bannerLine("a", "Warning · FAKE a: Apdex 0.85 (min 0.9)");
    bannerLine("b", "Warning · FAKE b: Apdex 0.75 (min 0.9)");
  });

  it("a browser cache written before apdexMin existed → the minimum is 0.9 while the server is unreachable", () => {
    cy.viewport(1440, 900);
    stub([a, b]);
    cy.intercept("GET", "/api/settings", { statusCode: 500, body: {} }).as("settings");
    cy.visit("/", { onBeforeLoad: (w) => w.localStorage.setItem("perf-thresholds", JSON.stringify({ loadSeconds: 3, errorPercent: 2, uptimeSLA: 99.9 })) });
    cy.wait("@settings");
    tileReads("Avg Page Load Time", "1.1s", "Healthy", "limit 3s");
    tileReads("Apdex Score", "0.80", "Warning", "min 0.9");
  });
});

describe("Settings → Performance Thresholds: Apdex Minimum", () => {
  const field = () => cy.contains("label", "Apdex Minimum (0-1)", { timeout: 15000 }).parent().parent();

  beforeEach(() => {
    cy.viewport(1440, 900);
    stub([page("blog", { loadTime: 1200, errorRate: 0.2, apdex: 0.95 })]);
    // The save is answered here, so the run never writes a settings file.
    cy.intercept("PUT", "/api/settings", (req) => req.reply({ ...DEFAULTS, ...req.body })).as("save");
    cy.visit("/settings");
    cy.wait("@settings");
    cy.contains("Performance Thresholds", { timeout: 15000 }).click(); // the tab; the sliders are not on the first one
  });

  it("the slider is there with its value, range, step and help text", () => {
    field().should("contain", "Alert triggers if a page's Apdex falls below this value.");
    field().contains("span", /^0\.9$/).should("be.visible");
    field().find("input[type=range]").should("have.length", 1).and("have.attr", "min", "0").and("have.attr", "max", "1").and("have.attr", "step", "0.05").and("have.value", "0.9");
  });

  it("moving it with the keyboard saves apdexMin with a PUT and shows the new value", () => {
    field().find("input[type=range]").focus().type("{rightarrow}", { force: true });
    cy.wait("@save").then(({ request }) => {
      expect(Object.keys(request.body)).to.deep.equal(["apdexMin"]);
      expect(request.body.apdexMin).to.be.closeTo(0.95, 1e-9);
    });
    field().contains("span", /^0\.95$/).should("be.visible");

    field().find("input[type=range]").focus().type("{leftarrow}{leftarrow}", { force: true });
    cy.wait("@save");
    cy.wait("@save").its("request.body.apdexMin").should("be.closeTo", 0.85, 1e-9);
    field().contains("span", /^0\.85$/).should("be.visible");
  });
});

// The real route. Each body is refused before anything is written, so no settings file is touched.
describe("PUT /api/settings refuses an apdexMin outside 0..1", () => {
  [1.5, -0.1, "0.8", null].forEach((bad) => {
    it(`${JSON.stringify(bad)} → 400 with the range message`, () => {
      cy.request({ method: "PUT", url: "/api/settings", body: { apdexMin: bad }, failOnStatusCode: false }).then((res) => {
        expect(res.status).to.equal(400);
        expect(res.body).to.deep.equal({ error: "apdexMin must be a number between 0 and 1." });
      });
    });
  });
});

describe("390px wide", () => {
  it("the tiles' values and status lines fit, with no horizontal page scroll", () => {
    cy.viewport(390, 844);
    // The longest lines the tiles can show: a Critical load time and error rate, a Warning Apdex.
    stub([page("blog", { loadTime: 12500, errorRate: 12.34, apdex: 0.3 })]);
    cy.visit("/");
    cy.wait("@settings");
    tileReads("Avg Page Load Time", "12.5s", "Critical", "limit 1.5s");
    tileReads("Error Rate", "12.34%", "Critical", "limit 2%");
    tileReads("Apdex Score", "0.30", "Warning", "min 0.9");
    ["Avg Page Load Time", "Error Rate", "Page views (24h)", "Apdex Score"].forEach((label) =>
      tile(label).should(($tile) => {
        const box = $tile[0].getBoundingClientRect();
        const value = $tile.children("p")[1];
        const line = value.getBoundingClientRect();
        expect(box.left, `${label}: tile starts on screen`).to.be.at.least(0);
        expect(box.right, `${label}: tile ends on screen`).to.be.at.most(390);
        expect(value.scrollWidth, `${label}: value and status line are not clipped`).to.be.at.most(value.clientWidth);
        expect(line.left, `${label}: value stays inside its tile`).to.be.at.least(box.left);
        expect(line.right, `${label}: value stays inside its tile`).to.be.at.most(box.right);
        Cypress.log({ name: "390px", message: `${label}: tile ${Math.round(box.width)}px wide, value line ${Math.round(line.height)}px high` });
      })
    );
    cy.document().should((doc) => expect(doc.documentElement.scrollWidth, "no horizontal page scroll").to.be.at.most(doc.documentElement.clientWidth));
    cy.screenshot("one-health-rule-390", { capture: "viewport", overwrite: true });
  });
});
