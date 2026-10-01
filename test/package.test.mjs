// Run: node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

test("package.json is publishable with a bin", () => {
  assert.notEqual(pkg.private, true);
  assert.equal(pkg.bin["performance-dashboard"], "bin/cli.mjs");
  assert.match(pkg.engines.node, />=\s*20\.12/);
  assert.equal(pkg.scripts.prepublishOnly, "next build");
  assert.match(readFileSync(join(root, "bin/cli.mjs"), "utf8"), /^#!\/usr\/bin\/env node/);
});

test("npm pack file list ships bin/public, never .next/dev or .next/cache", () => {
  const json = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts", "--cache", join(tmpdir(), "npm-pack-cache")], { cwd: root, encoding: "utf8" });
  const files = JSON.parse(json)[0].files.map((f) => f.path);
  assert.ok(files.includes("bin/cli.mjs") && files.includes("bin/output.mjs"));
  assert.ok(files.includes("package.json"));
  assert.ok(!files.some((f) => /^\.next\/(dev|cache)\//.test(f)), "dev/cache leaked into package");
  assert.ok(!files.some((f) => /^(cypress|test|docs|\.claude)\/|^cypress\.config/.test(f)), "test/dev files leaked into package");
  assert.ok(!files.some((f) => /(^|\/)\.env(?!\.local\.example)/.test(f)), "env file shipped");
});

test(".gitignore: example env is tracked-able, real env files stay ignored", () => {
  const ignored = (f) => spawnSync("git", ["check-ignore", "-q", f], { cwd: root }).status === 0;
  assert.equal(ignored(".env.local.example"), false);
  assert.equal(ignored(".env.local"), true);
  assert.equal(ignored(".env"), true);
});

test("npm run lint has 0 errors", () => {
  const r = spawnSync("npm", ["run", "lint"], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout.slice(-800));
});

test("scoped package name is publishable and README uses it", () => {
  assert.match(pkg.name, /^@[a-z0-9-]+\/metricflow$/);
  assert.equal(pkg.publishConfig?.access, "public"); // scoped packages are private by default
  assert.deepEqual(Object.keys(pkg.bin), ["performance-dashboard"]); // single bin so `npx <name>` runs it
  assert.ok(readFileSync(join(root, "README.md"), "utf8").includes(`npx ${pkg.name}`), "README must show `npx " + pkg.name + "`");
});

// The published package ships a prebuilt .next, so only what `next start` loads at runtime belongs in dependencies.
test("dependencies are runtime-only; build/UI-only packages are devDependencies", () => {
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ["axios", "next", "react", "react-dom"]);
  for (const d of ["recharts", "lucide-react", "@base-ui/react", "class-variance-authority", "cn", "shadcn", "tw-animate-css", "@sentry/node", "dotenv"]) {
    assert.ok(pkg.devDependencies?.[d], `${d} must be in devDependencies`);
    assert.ok(!pkg.dependencies[d], `${d} must not be in dependencies`);
  }
});
