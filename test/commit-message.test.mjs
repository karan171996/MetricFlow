// .githooks/check-commit-message.mjs: the commit-message / PR-title rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { problem, TYPES } from "../.githooks/check-commit-message.mjs";
import { root } from "./helpers.mjs";

test("valid headers pass: every type, optional scope, optional !", () => {
  for (const t of TYPES) assert.equal(problem(`${t}: do the thing`), null, t);
  for (const ok of ["fix(api): handle empty response", "feat(cli)!: drop --old flag", "chore(release): 0.1.6", "docs(skill): live-test uses test:real"]) {
    assert.equal(problem(ok), null, ok);
  }
});

test("invalid headers are rejected with the format in the message", () => {
  for (const bad of ["Readme updated", "fix:gitIgnore update", "fix : x", "feature: x", "Fix: x", "fix(Api): x", "fix():x", "fix: ", ""]) {
    assert.match(problem(bad) ?? "", /type\(scope\): description/, JSON.stringify(bad));
  }
});

test("only the first line is checked, and it must fit in 72 characters", () => {
  assert.equal(problem("fix: short\n\nAny body text, even without a type."), null);
  assert.match(problem(`fix: ${"x".repeat(80)}`), /72/);
});

test("messages git writes itself are allowed", () => {
  for (const ok of ["Merge pull request #7 from a/b", 'Revert "feat: x"', "fixup! fix: x", "squash! feat: y"]) assert.equal(problem(ok), null, ok);
});

test("CLI: --text and a message file (with git's # comment lines) exit 0 or 1", () => {
  const run = (...a) => spawnSync("node", [join(root, ".githooks/check-commit-message.mjs"), ...a], { encoding: "utf8" });
  assert.equal(run("--text", "feat: add thing").status, 0);
  const bad = run("--text", "added thing");
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /CONTRIBUTING\.md/);
  assert.equal(run("--text").status, 1);
});
