export {}; // make this file a module so top-level names do not clash across specs
// /tools/lighthouse in target mode, with every API stubbed (no Lighthouse run, no Chrome): status line and Run now.
const status = (s: object) => ({ state: "idle", done: 0, total: 0, lastRunAt: null, target: true, ...s });

beforeEach(() => {
  cy.viewport(1440, 900);
  cy.intercept("GET", "/api/setup", { configured: true, tools: ["lighthouse"], keys: {} });
  cy.intercept("GET", "/api/metrics", { configured: true, tools: ["lighthouse"], sources: { pages: "lighthouse", lighthouse: "lighthouse" }, pages: [], history: [] });
});

describe("Lighthouse runs on the project address", () => {
  it("shows 'Running x of y' while a run is in progress, then the last run time", () => {
    let calls = 0;
    cy.intercept("GET", "/api/lighthouse", (req) => {
      calls++;
      req.reply(calls === 1 ? status({ state: "running", done: 1, total: 3 }) : status({ state: "idle", done: 3, total: 3, lastRunAt: "2026-10-17T10:00:00.000Z" }));
    }).as("status");
    cy.visit("/tools/lighthouse");
    cy.contains('[role="status"]', "Running 2 of 3").should("be.visible");
    cy.contains("button", "Running…").should("be.disabled");
    // it polls while running, and the line moves on when the run finishes
    cy.contains('[role="status"]', "Last run", { timeout: 10000 }).should("be.visible");
    cy.contains("button", "Run now").should("be.enabled");
  });

  it("Run now posts JSON and shows the run starting", () => {
    cy.intercept("GET", "/api/lighthouse", status({ lastRunAt: "2026-10-17T10:00:00.000Z" }));
    cy.intercept("POST", "/api/lighthouse", { statusCode: 202, body: status({ state: "running", done: 0, total: 0 }) }).as("run");
    cy.visit("/tools/lighthouse");
    cy.contains("button", "Run now").click();
    cy.wait("@run").its("request.headers.content-type").should("match", /application\/json/);
    cy.contains('[role="status"]', "Finding pages").should("be.visible");
  });

  it("shows the fixed error text when a run failed", () => {
    cy.intercept("GET", "/api/lighthouse", status({ state: "error", error: "Lighthouse needs Google Chrome installed on this machine.", lastRunAt: "2026-10-17T10:00:00.000Z" }));
    cy.visit("/tools/lighthouse");
    cy.contains('[role="status"]', "Lighthouse needs Google Chrome installed on this machine.").should("be.visible");
  });

  it("no project address: no status line and no Run now", () => {
    cy.intercept("GET", "/api/lighthouse", status({ target: false })).as("status");
    cy.visit("/tools/lighthouse");
    cy.wait("@status");
    cy.contains("h1", "Lighthouse CI").should("be.visible");
    cy.contains("button", "Run now").should("not.exist");
  });
});
