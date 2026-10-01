describe("smoke", () => {
  it("health API returns ok", () => {
    cy.request("/api/health").its("body.status").should("eq", "ok");
  });

  ["/", "/performance", "/settings"].forEach((path) => {
    it(`${path} loads`, () => {
      cy.visit(path);
      cy.get("body").should("be.visible");
    });
  });
});
