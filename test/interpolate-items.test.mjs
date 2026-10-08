import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { interpolateItems, easeOut } = await load("lib/interpolateItems.ts");

test("bar count-up: new names start at 0, known names start at their old value, last frame is exact", () => {
  const items = [{ name: "a", value: 1234.567 }, { name: "b", value: 300 }, { name: "c", value: 0.1 + 0.2 }];
  const from = { b: 100, gone: 50 };
  assert.deepEqual(interpolateItems(items, from, 0), { a: 0, b: 100, c: 0 });
  assert.equal(interpolateItems(items, from, 0.5).b, 200);
  assert.deepEqual(interpolateItems(items, from, 1), { a: 1234.567, b: 300, c: 0.1 + 0.2 }); // exact, removed name dropped
  assert.equal(interpolateItems(items, { b: 300 }, 0.37).b, 300); // unchanged value does not move
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  assert.ok(easeOut(0.5) > 0.5); // ease-out, not linear
});
