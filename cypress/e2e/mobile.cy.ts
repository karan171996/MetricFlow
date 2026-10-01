// useIsMobile() was rewritten with useSyncExternalStore: pages must still render at both sizes.
describe("responsive (useIsMobile)", () => {
  [["mobile", 390, 844], ["desktop", 1440, 900]].forEach(([name, w, h]) => {
    it(`/settings renders at ${name} width`, () => {
      cy.viewport(w as number, h as number);
      cy.visit("/settings");
      cy.contains(/threshold/i).should("exist"); // ThresholdSettings (quotes escaped)
    });
    it(`/ renders at ${name} width`, () => {
      cy.viewport(w as number, h as number);
      cy.visit("/");
      cy.get("body").should("be.visible");
    });
  });
});
