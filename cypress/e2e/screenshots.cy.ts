export {}; // make this file a module so top-level names do not clash across specs
// Captures screenshots into cypress/screenshots/ only (never docs/images; Kelly owns those). Run: npx cypress run --spec cypress/e2e/screenshots.cy.ts
// Every API the pages call is stubbed with fake sample data, so real New Relic/Sentry numbers never end up in a screenshot.
const PAGES = [
  ["Homepage", "home", "/", { loadTime: 900, lcp: 1400, ttfb: 180, cls: 0.05, inp: 120, errorRate: 0.3, throughput: 2400, apdexScore: 0.96 }, 3],
  ["Pricing", "pricing", "/pricing", { loadTime: 2400, lcp: 3100, ttfb: 420, cls: 0.12, inp: 310, errorRate: 1.0, throughput: 800, apdexScore: 0.84 }, 6],
  ["Blog", "blog", "/blog", { loadTime: 1500, lcp: 2100, ttfb: 300, cls: 0.1, inp: 180, errorRate: 3.0, throughput: 600, apdexScore: 0.9 }, 9],
  ["Docs", "docs", "/docs", { loadTime: 1100, lcp: 1600, ttfb: 210, cls: 0.02, inp: 90, errorRate: 0.1, throughput: 450, apdexScore: 0.95 }, 0],
  ["Checkout", "checkout", "/checkout", { loadTime: 1300, lcp: 1900, ttfb: 260, cls: 0.04, inp: 150, errorRate: 0.4, throughput: 250, apdexScore: 0.92 }, 1],
] as const;
const status = (nr: { loadTime: number; errorRate: number }) => (nr.loadTime > 2000 || nr.errorRate > 2 ? "Warning" : "Healthy");

// `drift` scales the numbers so older snapshots differ a little and the trend charts have a shape.
const pages = (drift: number, at: string) =>
  PAGES.map(([name, slug, url, nr, errors], i) => {
    const d = 1 + drift * (i % 2 ? 1 : -1);
    const m = { ...nr, fid: 0, loadTime: Math.round(nr.loadTime * d), lcp: Math.round(nr.lcp * d), ttfb: Math.round(nr.ttfb * d), apdexScore: Math.min(1, +(nr.apdexScore / d).toFixed(2)) };
    return {
      name, slug, url, visitors: String(nr.throughput), status: status(m), newRelic: m, recordedAt: at,
      sentry: { errorCount: errors, errorRate: 0, warningCount: 0, latestErrors: errors ? [{ title: "TypeError: Cannot read properties of undefined (reading 'items')", count: errors, lastSeen: at }] : [] },
    };
  });
const history = [0.12, 0.09, 0.07, 0.05, 0.03, 0].map((drift, i) => {
  const timestamp = `2026-10-03T14:${String(7 + i * 5).padStart(2, "0")}:00.000Z`;
  return { timestamp, pages: pages(drift, timestamp) };
});
const latest = history[history.length - 1];

describe("README screenshots", () => {
  beforeEach(() => {
    cy.viewport(1280, 720); // headless Electron's window size; a bigger viewport gets cropped
    cy.intercept("GET", "/api/metrics", { configured: true, tools: ["new-relic", "sentry"], project: "acme-storefront", pages: latest.pages, history, timestamp: latest.timestamp });
    cy.intercept("GET", "/api/timings", { items: [{ name: "New Relic: metrics", value: 412 }, { name: "Sentry: events", value: 268 }, { name: "New Relic: discover pages", value: 190 }] });
    cy.intercept("POST", "/api/analyze", {
      analysis: "Pricing is the slowest page and Blog has the most errors.",
      alerts: [
        { severity: "high", page: "Pricing", metric: "lcp", message: "LCP is 3.1s on Pricing. Preload the hero image and serve it as WebP." },
        { severity: "medium", page: "Blog", metric: "errorRate", message: "Error rate is 3.0% on Blog. Check the TypeError reported in Sentry." },
      ],
      recommendations: ["Lazy-load images below the fold on Blog.", "Cache the pricing API response at the edge."],
    });
  });

  [["/", "dashboard"], ["/performance", "performance"]].forEach(([path, name]) => {
    it(`captures ${name}`, () => {
      cy.visit(path);
      cy.contains("acme-storefront").should("be.visible");
      cy.wait(2000); // let charts animate in
      cy.screenshot(name, { capture: "viewport", overwrite: true });
    });
  });
});
