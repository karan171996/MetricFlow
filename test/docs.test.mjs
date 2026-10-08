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

test("README stays a short landing page, and every docs page it links to exists", () => {
  const md = readFileSync(join(root, "README.md"), "utf8");
  assert.ok(md.split("\n").length <= 120, "README has grown past a landing page: move detail into docs/");
  const pages = [...md.matchAll(/blob\/main\/(docs\/[a-z-]+\.md)/g)].map((m) => m[1]);
  assert.ok(pages.length >= 6, "README links to the docs pages");
  for (const page of new Set(pages)) {
    assert.ok(existsSync(join(root, page)), `${page} is linked from the README but does not exist`);
    // npm does not ship docs/, so a page must not rely on a relative image or a link back into the package.
    assert.doesNotMatch(readFileSync(join(root, page), "utf8"), /!\[[^\]]*\]\((?!https:\/\/)/, `${page}: images must be absolute URLs`);
  }
  // README images and links are absolute too: the same file is shown on npm, where relative paths do not resolve.
  assert.doesNotMatch(md, /\]\((?!https:\/\/|#)/, "README has a relative link or image");
});

test("docs/images exists and is kept out of the npm package", () => {
  assert.ok(existsSync(join(root, "docs/images/.gitkeep")));
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts", "--cache", join(tmpdir(), "npm-pack-cache")], { cwd: root, encoding: "utf8" });
  const files = JSON.parse(out)[0].files.map((f) => f.path);
  assert.ok(!files.some((f) => f.startsWith("docs/")), "docs/ leaked into package");
  assert.ok(files.includes("README.md")); // npm always ships the README
});
