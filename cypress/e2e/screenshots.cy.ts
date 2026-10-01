// Captures screenshots into cypress/screenshots/ only (never docs/images; Kelly owns those). Run: npx cypress run --spec cypress/e2e/screenshots.cy.ts
describe("README screenshots", () => {
  beforeEach(() => cy.viewport(1440, 900));
  [["/", "dashboard"], ["/performance", "performance"]].forEach(([path, name]) => {
    it(`captures ${name}`, () => {
      cy.visit(path);
      cy.wait(2000); // let charts animate in
      cy.screenshot(name, { capture: "viewport", overwrite: true });
    });
  });
});
