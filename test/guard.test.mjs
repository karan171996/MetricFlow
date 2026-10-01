// Proof the commit/push guard fires. Uses throwaway repos and throwaway placeholder values only; the real .env.local is never read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { root } from "./helpers.mjs";

const PLACEHOLDER = "zz-throwaway-" + "q9X7".repeat(4); // not a real key; assembled so this file never contains it whole
const sh = (cwd, cmd, env = {}) => spawnSync("sh", ["-c", cmd], { cwd, encoding: "utf8", env: { ...process.env, ...env } });
function repo(files, envFile = `API_KEY=${PLACEHOLDER}\nORG_SLUG=acme\n`) {
  const dir = mkdtempSync(join(tmpdir(), "mf-guard-"));
  sh(dir, "git init -q && git config user.email t@t && git config user.name t");
  writeFileSync(join(dir, "throwaway.env"), envFile); // stands in for .env.local
  mkdirSync(join(dir, ".githooks"));
  for (const f of ["secret-scan.sh", "guard-env-values.mjs"]) sh(dir, `cp "${join(root, ".githooks", f)}" .githooks/`);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  sh(dir, "git add -A -- . ':!throwaway.env'");
  return dir;
}
const scan = (dir) => sh(dir, "sh .githooks/secret-scan.sh", { GUARD_ENV_FILE: "throwaway.env" });

test("a value from the env file in a staged file is blocked, by name, value never printed", () => {
  const r = scan(repo({ "a.ts": `const x = "${PLACEHOLDER}";\n` }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /API_KEY in a\.ts/);
  assert.ok(!(r.stdout + r.stderr).includes(PLACEHOLDER));
});

test("non-secret env names (org slug) are not treated as secrets; clean change passes", () => {
  assert.equal(scan(repo({ "a.ts": 'const org = "acme";\n' })).status, 0);
});

test("FAKE-* placeholders are allowed", () => assert.equal(scan(repo({ "a.ts": 'const k = "FAKE-NRAK-0000000000000000000000";\n' })).status, 0));

test(".env files are blocked except the placeholder templates", () => {
  for (const f of [".env.local", ".env", ".env.production"]) assert.equal(scan(repo({ [f]: "A=1\n" })).status, 1, f);
  for (const f of [".env.local.example", ".env.test.example"]) assert.equal(scan(repo({ [f]: "A=\n" })).status, 0, f);
});

test("cypress screenshots, videos and test output are blocked", () => {
  for (const f of ["cypress/screenshots/a.png", "cypress/videos/a.mp4", "test-results/x.json", "coverage/lcov.info"]) assert.equal(scan(repo({ [f]: "x" })).status, 1, f);
});

test("guard on stdin (what pre-push feeds it) catches the value in a pushed commit log", () => {
  const dir = repo({});
  const log = `+++ b/src/leak.ts\n+const t = "${PLACEHOLDER}";\n`;
  const r = spawnSync("node", [join(root, ".githooks/guard-env-values.mjs"), "stdin"], { cwd: dir, input: log, encoding: "utf8", env: { ...process.env, GUARD_ENV_FILE: "throwaway.env" } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /API_KEY in src\/leak\.ts/);
  assert.ok(!r.stderr.includes(PLACEHOLDER));
});

test("no env file on this machine: guard exits 0 (pattern scan still applies)", () => {
  const r = spawnSync("node", [join(root, ".githooks/guard-env-values.mjs"), "stdin"], { cwd: tmpdir(), input: "+x\n", encoding: "utf8", env: { ...process.env, GUARD_ENV_FILE: "does-not-exist.env" } });
  assert.equal(r.status, 0);
});
