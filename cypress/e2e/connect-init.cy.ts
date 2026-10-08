// /connect shows one init snippet with a block for each connected tool, pre-filled with public values only.
const src = (recent: number | null) => ({ recent, lastEventAt: null });
const nrSetup = { appCount: 1, appName: "example-site", applicationId: "111111111", browserKey: "NRJS-examplebrowserkey" };
const DSN = "https://0123456789abcdef0123456789abcdef@o123.ingest.sentry.io/456";
const nr = { accountId: "1234567", browser: src(0), ajax: src(0), custom: src(0), setup: nrSetup };
const snippet = () => cy.get("pre").eq(0).invoke("text");
const noVendorInstall = () => cy.get("pre").each(($p) => expect($p.text()).not.to.match(/@sentry\/browser|@newrelic\/browser-agent/));

describe("/connect init snippet", () => {
  it("New Relic only: one block, filled in, with the send example and no Sentry", () => {
    cy.intercept("GET", "/api/connect", { configured: true, tools: ["new-relic"], insertKeySet: false, ...nr });
    cy.visit("/connect");
    cy.get("pre").should("have.length", 2);
    snippet().should("contain", "'new-relic': {").and("contain", "browserKey: 'NRJS-examplebrowserkey',").and("not.contain", "sentry").and("not.contain", "replace:");
    cy.get("pre").eq(1).should("contain", "send('checkout_step'");
    cy.contains("3. Verify").should("be.visible");
    noVendorInstall();
  });

  it("Sentry only: one block with the public DSN, no New Relic and no send example", () => {
    cy.intercept("GET", "/api/connect", { configured: true, tools: ["sentry"], insertKeySet: false, dsn: DSN, sentry: src(0) });
    cy.visit("/connect");
    cy.get("pre").should("have.length", 1);
    snippet().should("contain", `dsn: '${DSN}',`).and("not.contain", "new-relic").and("not.contain", "replace:");
    cy.contains("2. Verify").should("be.visible");
    noVendorInstall();
  });

  it("both tools: both blocks in one call, eu region shown, and Copy copies exactly what is shown", () => {
    cy.intercept("GET", "/api/connect", { configured: true, tools: ["new-relic", "sentry"], insertKeySet: false, region: "eu", dsn: DSN, sentry: src(0), ...nr });
    cy.visit("/connect", { onBeforeLoad: (win) => { cy.stub(win.navigator.clipboard, "writeText").as("copy").resolves(); } });
    snippet().should("match", /init\(\{\n {2}'new-relic': \{[\s\S]*region: 'eu',[\s\S]*\n {2}sentry: \{[\s\S]*\n\}\);$/);
    snippet().then((text) => {
      expect(text.match(/npm i /g)).to.have.length(1);
      cy.contains("button", "Copy").first().click();
      cy.get("@copy").should("have.been.calledOnceWith", text);
      cy.contains("Copied").should("be.visible");
    });
    noVendorInstall();
  });

  it("Sentry connected but its saved DSN cannot be published: says why, links to Setup, and shows the example to replace", () => {
    cy.intercept("GET", "/api/connect", { configured: true, tools: ["sentry"], insertKeySet: false, sentry: src(0) });
    cy.visit("/connect");
    cy.contains("Your saved Sentry DSN cannot go in a public page.").should("be.visible");
    cy.get('a[href="/setup#sentry"]').should("be.visible");
    snippet().should("match", /dsn: 'https:\/\/0{32}@o0\.ingest\.sentry\.io\/0', {3}\/\/ replace: /);
  });
});
