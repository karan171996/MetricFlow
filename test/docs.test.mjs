import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

test("README is project docs, not the create-next-app template", () => {
  const md = readFileSync(join(root, "README.md"), "utf8");
  assert.doesNotMatch(md, /bootstrapped with .*create-next-app/);
  assert.match(md, /performance-dashboard/);
});

test("docs/images exists and is kept out of the npm package", () => {
  assert.ok(existsSync(join(root, "docs/images/.gitkeep")));
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts", "--cache", join(tmpdir(), "npm-pack-cache")], { cwd: root, encoding: "utf8" });
  const files = JSON.parse(out)[0].files.map((f) => f.path);
  assert.ok(!files.some((f) => f.startsWith("docs/")), "docs/ leaked into package");
  assert.ok(files.includes("README.md")); // npm always ships the README
});
