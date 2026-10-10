// The 3D guard (lib/use3d.ts): limits win over the user's choice, 3D is opt-in, and a missing browser
// value never counts as a limit. The hook and Settings switch are covered by cypress/e2e/use3d-setting.cy.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { evaluate3d, explain3d, isLimit, LOW_CORES } = await load("lib/use3d.ts");

const ok = { reducedMotion: false, cores: 8, saveData: false, webgl: true, userChoice: true };

test("3D is off by default: with no limit and no choice the 2D view stays", () => {
  assert.deepEqual(evaluate3d({ ...ok, userChoice: false }), { enabled: false, reason: "off" });
});

test("with no limit and the user's choice on, 3D is enabled with no reason", () => {
  assert.deepEqual(evaluate3d(ok), { enabled: true });
});

test("each limit disables 3D with its own reason, even when the user chose 3D", () => {
  assert.deepEqual(evaluate3d({ ...ok, reducedMotion: true }), { enabled: false, reason: "reduced-motion" });
  assert.deepEqual(evaluate3d({ ...ok, cores: 2 }), { enabled: false, reason: "low-cores" });
  assert.deepEqual(evaluate3d({ ...ok, cores: 1 }), { enabled: false, reason: "low-cores" });
  assert.deepEqual(evaluate3d({ ...ok, saveData: true }), { enabled: false, reason: "save-data" });
  assert.deepEqual(evaluate3d({ ...ok, webgl: false }), { enabled: false, reason: "no-webgl" });
});

test("the core limit is at or below 2: 3 cores is allowed", () => {
  assert.equal(LOW_CORES, 2);
  assert.equal(evaluate3d({ ...ok, cores: 3 }).enabled, true);
});

test("a missing or zero core count and a missing data-saver flag are not limits", () => {
  assert.equal(evaluate3d({ ...ok, cores: undefined, saveData: undefined }).enabled, true);
  assert.equal(evaluate3d({ ...ok, cores: 0 }).enabled, true);
});

test("when several limits apply, reduced motion is reported first", () => {
  assert.equal(evaluate3d({ reducedMotion: true, cores: 1, saveData: true, webgl: false, userChoice: true }).reason, "reduced-motion");
});

test("isLimit is true for device limits and false for 'off' and no reason", () => {
  for (const r of ["reduced-motion", "low-cores", "save-data", "no-webgl"]) assert.equal(isLimit(r), true, r);
  assert.equal(isLimit("off"), false);
  assert.equal(isLimit(undefined), false);
});

test("every limit has its own plain-language explanation and the default text is the help line", () => {
  const texts = ["reduced-motion", "low-cores", "save-data", "no-webgl"].map((r) => explain3d(r));
  assert.equal(new Set(texts).size, 4);
  assert.match(explain3d("off"), /Off by default/);
  assert.equal(explain3d(undefined), explain3d("off"));
});
