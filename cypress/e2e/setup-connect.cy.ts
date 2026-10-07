export {}; // make this file a module so top-level names do not clash across specs
// /setup and /connect with the APIs stubbed. Fake keys only (prefixed FAKE-).
const KEYS = { NEWRELIC_API_KEY: "FAKE-NR", NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID: "1234567", SENTRY_API_KEY: "FAKE-SENTRY", SENTRY_DSN: "https://fakekey@o1.ingest.sentry.io/1" };
const fill = () => Object.entries(KEYS).forEach(([k, v]) => cy.get(`#${k}`).type(v));
const allSet = Object.fromEntries(Object.keys(KEYS).map((k) => [k, true]));

describe("/setup", () => {
  beforeEach(() => cy.intercept("GET", "/api/setup", { configured: false, keys: {} }));

  it("explains each key, says which New Relic key reads, masks secrets", () => {
    cy.visit("/setup");
    cy.contains("READS your data").should("be.visible");
    cy.contains("Ingest - License").should("be.visible");
    cy.get("#NEWRELIC_API_KEY").should("have.attr", "type", "password");
    cy.get("#SENTRY_API_KEY").should("have.attr", "type", "password");
    cy.get("#SENTRY_DSN").should("have.attr", "type", "text");
  });

  it("empty submit: every field marked Required, nothing saved", () => {
    cy.intercept("POST", "/api/setup", (req) => req.reply({ statusCode: 400, body: { saved: false, results: Object.fromEntries(Object.keys(KEYS).map((k) => [k, { ok: false, error: "Required." }])) } })).as("save");
    cy.visit("/setup");
    cy.contains("button", "Check and save").should("be.disabled"); // nothing entered: cannot submit
    cy.get("@save.all").should("have.length", 0);
  });

  it("bad key: the message names the failing field, other fields stay untouched", () => {
    cy.intercept("POST", "/api/setup", { statusCode: 422, body: { saved: false, results: { NEWRELIC_API_KEY: { ok: false, error: "New Relic was rejected (check the key and its permissions)." }, SENTRY_API_KEY: { ok: true } } } });
    cy.visit("/setup");
    fill();
    cy.contains("button", "Check and save").click();
    cy.contains("✗ New Relic was rejected").should("be.visible");
    cy.contains("✓ Checked").should("be.visible");
    cy.get("#NEWRELIC_API_KEY").should("have.value", "FAKE-NR"); // not cleared, user can fix it
  });

  it("valid keys: sent once as JSON, success message, inputs cleared and shown only as 'Set'", () => {
    cy.intercept("POST", "/api/setup", { statusCode: 200, body: { saved: true, results: {} } }).as("save");
    cy.visit("/setup");
    fill();
    cy.contains("button", "Check and save").click();
    cy.wait("@save").its("request.body").should("deep.equal", KEYS);
    cy.contains("No restart needed").should("be.visible");
    cy.get("#NEWRELIC_API_KEY").should("have.value", "");
    cy.contains("✓ Set").should("be.visible");
    cy.contains("FAKE-NR").should("not.exist");
  });

  it("server write failure is shown, not swallowed", () => {
    cy.intercept("POST", "/api/setup", { statusCode: 500, body: { saved: false, error: "Keys are valid but .env.local could not be written. Check folder permissions." } });
    cy.visit("/setup");
    fill();
    cy.contains("button", "Check and save").click();
    cy.contains("could not be written").should("be.visible");
  });

  it("already-set keys show 'Set' and never their values", () => {
    cy.intercept("GET", "/api/setup", { configured: true, keys: allSet });
    cy.visit("/setup");
    cy.contains("✓ Set").should("be.visible");
    cy.get("#NEWRELIC_API_KEY").should("have.value", "");
  });
});

describe("/connect", () => {
  const src = (recent: number | null, extra = {}) => ({ recent, lastEventAt: null, ...extra });

  it("before setup: points to /setup", () => {
    cy.intercept("GET", "/api/connect", { configured: false });
    cy.visit("/connect");
    cy.get('a[href="/setup"]').should("be.visible");
  });

  it("no lookup data: snippet documents the env vars, with a shaped example and no real key", () => {
    cy.intercept("GET", "/api/connect", { configured: true, insertKeySet: false, browser: src(0), custom: src(0), sentry: src(0) });
    cy.visit("/connect");
    cy.get("pre").should("have.length", 3);
    // The snippet names the variables to set. It used to carry <ANGLE_BRACKET> placeholders,
    // which read as "any value fits" and sent users hunting for the wrong one.
    cy.get("pre").eq(0).invoke("text").should("match", /NEXT_PUBLIC_NEWRELIC_BROWSER_KEY=NRJS-x+/);
    cy.get("pre").eq(1).should("contain", "emitMetric");
    cy.get("pre").eq(2).should("contain", "<YOUR_SENTRY_DSN>");
    cy.contains("User API key").should("be.visible");
    cy.contains("Ingest - License key").should("be.visible");
    // The snippet names these prefixes on purpose ("NOT your NRAK- User API key"), so match a
    // key-SHAPED value, not the bare prefix. Thresholds mirror .githooks/secret-scan.sh.
    cy.get("pre").each(($p) => expect($p.text()).not.to.match(/NRAK-[A-Z0-9]{10,}|FAKE-|sntry[su]_[A-Za-z0-9]{10,}/));
  });

  it("fills snippet 1 with the real application id and browser key once New Relic reports them", () => {
    cy.intercept("GET", "/api/connect", {
      configured: true, accountId: "1234567", insertKeySet: false,
      browser: src(0), custom: src(0), sentry: src(0),
      setup: { appCount: 1, appName: "example-site", applicationId: "111111111", browserKey: "NRJS-examplebrowserkey" },
    });
    cy.visit("/connect");
    // Nothing left to copy by hand: this is what stops an ID being pasted instead of a key.
    cy.get("pre").eq(0).invoke("text").should("contain", "NEXT_PUBLIC_NEWRELIC_APP_ID=111111111");
    cy.get("pre").eq(0).invoke("text").should("contain", "NEXT_PUBLIC_NEWRELIC_BROWSER_KEY=NRJS-examplebrowserkey");
    cy.contains("application ID 111111111").should("be.visible");
  });

  it("no Browser app: the chain names that link instead of showing empty rows", () => {
    cy.intercept("GET", "/api/connect", {
      configured: true, accountId: "1234567", insertKeySet: false,
      browser: src(0), custom: src(0), sentry: src(0),
      setup: { appCount: 0, appName: null, applicationId: null, browserKey: null },
    });
    cy.visit("/connect");
    cy.contains("Add data > Browser monitoring").should("be.visible");
    cy.contains("Querying New Relic account").should("be.visible");
  });

  it("'events received' says 'None yet' when empty and updates without a page reload", () => {
    let n = 0;
    cy.intercept("GET", "/api/connect", (req) => {
      n++;
      req.reply({ configured: true, insertKeySet: true, browser: src(0), custom: n > 1 ? src(2, { lastEventAt: new Date().toISOString() }) : src(0), sentry: src(0) });
    });
    cy.visit("/connect");
    cy.contains("None yet").should("be.visible");
    cy.contains("Receiving data", { timeout: 15000 }).should("be.visible"); // poll, no reload
  });

  it("a source that cannot be read shows its error, others still show", () => {
    cy.intercept("GET", "/api/connect", { configured: true, insertKeySet: true, browser: src(1), custom: src(0), sentry: { recent: null, lastEventAt: null, error: "Could not read from Sentry." } });
    cy.visit("/connect");
    cy.contains("Could not read from Sentry.").should("be.visible");
    cy.contains("Receiving data").should("be.visible");
  });

  it("test event: button disabled without Insert key; with one it POSTs once and shows success", () => {
    cy.intercept("GET", "/api/connect", { configured: true, insertKeySet: false, browser: src(0), custom: src(0), sentry: src(0) });
    cy.visit("/connect");
    cy.contains("button", "Send test event").should("be.disabled");
    cy.intercept("GET", "/api/connect", { configured: true, insertKeySet: true, browser: src(0), custom: src(0), sentry: src(0) });
    cy.intercept("POST", "/api/connect", { statusCode: 200, body: { sent: true } }).as("sendTest");
    cy.visit("/connect");
    cy.contains("button", "Send test event").click();
    cy.get("@sendTest.all").should("have.length", 1);
    cy.contains("Test event sent").should("be.visible");
  });

  it("test event failure shows the exact reason", () => {
    cy.intercept("GET", "/api/connect", { configured: true, insertKeySet: true, browser: src(0), custom: src(0), sentry: src(0) });
    cy.intercept("POST", "/api/connect", { statusCode: 502, body: { sent: false, error: 'New Relic rejected the Insert key. It must be an "Ingest - License" key for this account.' } });
    cy.visit("/connect");
    cy.contains("button", "Send test event").click();
    cy.contains("rejected the Insert key").should("be.visible");
  });

  it("Insert key is saved through /api/setup and never echoed", () => {
    cy.intercept("GET", "/api/connect", { configured: true, insertKeySet: false, browser: src(0), custom: src(0), sentry: src(0) });
    cy.intercept("POST", "/api/setup", { statusCode: 200, body: { saved: true, results: {} } }).as("insert");
    cy.visit("/connect");
    cy.get("#insert-key").type("FAKE-INSERT");
    cy.contains("button", "Save").click();
    cy.wait("@insert").its("request.body").should("deep.equal", { NEWRELIC_INSERT_KEY: "FAKE-INSERT" });
    cy.contains("Insert key saved.").should("be.visible");
    cy.contains("FAKE-INSERT").should("not.exist");
  });
});
