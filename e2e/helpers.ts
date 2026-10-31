import { expect, type Locator, type Page, type Request } from "@playwright/test";

/** What a stub answers: a JSON body, or `{ statusCode, body, delay }`. */
type Reply = unknown;

const isStatic = (r: unknown): r is { statusCode?: number; body: unknown; delay?: number } =>
  typeof r === "object" && r !== null && "body" in r && Object.keys(r).every((k) => ["body", "statusCode", "delay"].includes(k));

/** One stubbed endpoint. `calls` are the requests seen; `wait()` resolves once the next unseen one has been answered. */
export class Stub {
  calls: Request[] = [];
  answered: Request[] = [];
  private used = 0;
  async wait() {
    await expect.poll(() => this.answered.length, { message: "waiting for a stubbed request" }).toBeGreaterThan(this.used);
    return this.answered[this.used++];
  }
}

/**
 * Answers `method path` (any query) with `reply`, a JSON body or a function of the request returning one.
 * Later stubs win over earlier ones. Other methods on the same path fall through to the next stub.
 */
export async function stub(page: Page, method: string, path: string, reply: Reply | ((req: Request) => Reply | Promise<Reply>)) {
  const s = new Stub();
  await page.route((url) => url.pathname === path, async (route) => {
    const req = route.request();
    if (req.method() !== method) return route.fallback();
    s.calls.push(req);
    const out = typeof reply === "function" ? await (reply as (r: Request) => Reply | Promise<Reply>)(req) : reply;
    const { statusCode = 200, body, delay = 0 } = isStatic(out) ? out : { body: out };
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      await route.fulfill({ status: statusCode, contentType: "application/json", body: JSON.stringify(body) });
    } catch {} // the page closed first
    s.answered.push(req);
  });
  return s;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRe = (t: string | RegExp) => (typeof t === "string" ? new RegExp(escape(t)) : t);

/**
 * Like cy.contains: `contains(page, text)` or `contains(page, selector, text)`.
 * Text is case-sensitive; a string matches as a substring. Yields the first match.
 */
export function contains(scope: Page | Locator, a: string | RegExp, b?: string | RegExp): Locator {
  if (b === undefined) return scope.getByText(toRe(a)).first();
  return scope.locator(a as string).filter({ hasText: toRe(b) }).first();
}

export const parent = (l: Locator) => l.locator("xpath=..");

/** Polls the text of a locator, e.g. `await text(pre).toContain("x")`. */
export const text = (l: Locator) => expect.poll(() => l.evaluateAll((els) => els.map((e) => e.textContent).join("")));

export async function noSideScroll(page: Page, label = "page") {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: `${label}: no horizontal page scroll` }).toBeLessThanOrEqual(0);
}

export const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screenshots/${name}.png` });

/**
 * Replaces setInterval/clearInterval in the page with a clock the test drives (like cy.clock(now, ["setInterval", "clearInterval"])).
 * Timeouts, requestAnimationFrame, CSS animations and Date keep running for real. Call before page.goto.
 */
export async function fakeIntervals(page: Page) {
  await page.addInitScript(() => {
    let now = 0, next = 1;
    const timers = new Map<number, { fn: () => void; ms: number; due: number }>();
    window.setInterval = ((fn: () => void, ms = 0) => {
      const id = next++, step = Math.max(Number(ms) || 0, 1);
      timers.set(id, { fn, ms: step, due: now + step });
      return id;
    }) as unknown as typeof setInterval;
    window.clearInterval = ((id?: number) => { timers.delete(id as number); }) as typeof clearInterval;
    (window as unknown as { __tick: (ms: number) => void }).__tick = (ms) => {
      now += ms;
      for (const [id, t] of [...timers]) for (let n = 0; timers.has(id) && t.due <= now && n < 1000; n++) { t.due += t.ms; t.fn(); }
    };
  });
}
export const tick = (page: Page, ms: number) => page.evaluate((m) => (window as unknown as { __tick: (ms: number) => void }).__tick(m), ms);
