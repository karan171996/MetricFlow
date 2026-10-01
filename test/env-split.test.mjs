import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));

test("basic glob never reaches test/live", () => {
  assert.ok(existsSync(new URL("./live/live.test.mjs", import.meta.url)));
  assert.ok(!existsSync(new URL("./live.test.mjs", import.meta.url)));
  const runner = read("scripts/test-env.mjs");
  assert.match(runner, /"test\/\*\.test\.mjs"/); // basic: top-level only, no recursion
  assert.match(runner, /"test\/live\/\*\.test\.mjs"/); // real: live only
  assert.doesNotMatch(pkg.scripts["test:cli"], /live/);
});

test("scripts: test and test:basic are basic, test:real is separate", () => {
  assert.equal(pkg.scripts["test:basic"], "node scripts/test-env.mjs basic");
  assert.equal(pkg.scripts["test:real"], "node scripts/test-env.mjs real");
  assert.equal(pkg.scripts.test, "npm run test:basic");
  assert.equal(pkg.scripts["test:live"], undefined);
});

test("live-metrics spec is excluded from basic and is the only real spec", () => {
  const runner = read("scripts/test-env.mjs");
  assert.match(runner, /s !== "live-metrics\.cy\.ts"/);
  assert.match(runner, /\["cypress\/e2e\/live-metrics\.cy\.ts"\]/);
});

test(".env.test.example has every key of .env.local.example, all placeholders", () => {
  const real = Object.keys(parseEnv(read(".env.local.example")));
  const fake = parseEnv(read(".env.test.example"));
  for (const k of real) assert.ok(k in fake, `${k} missing from .env.test.example`);
  for (const [k, v] of Object.entries(fake)) {
    if (k.startsWith("NEXT_PUBLIC_")) continue; // ids and urls, not secrets
    assert.match(v, /^FAKE-/, `${k} must be a FAKE- placeholder`);
  }
});

test("basic runner reads .env.test.example, redirects env writes, never touches .env.local", () => {
  const runner = read("scripts/test-env.mjs");
  const basic = runner.split('if (mode === "basic")')[1].split("} else")[0];
  assert.match(basic, /\.env\.test\.example/);
  assert.doesNotMatch(basic, /\.env\.local/);
  assert.match(runner, /METRICFLOW_ENV_FILE/);
  assert.doesNotMatch(runner, /(writeFile|copyFile|cpSync|appendFile)/); // no key copies
});

test("real runner fails clearly without .env.local", () => {
  assert.match(read("scripts/test-env.mjs"), /test:real needs real keys: \.env\.local not found/);
});
