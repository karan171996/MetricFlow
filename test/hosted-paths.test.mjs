// scripts/check-hosted-paths.mjs: hosted-only paths never get committed to this MIT repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkHostedPaths } from "../scripts/check-hosted-paths.mjs";
import { gitlessEnv, root } from "./helpers.mjs";

const script = join(root, "scripts/check-hosted-paths.mjs");
const run = (cwd) => spawnSync(process.execPath, [script], { cwd, encoding: "utf8", env: gitlessEnv() });
const DENIED = ["lib/hosted/db.ts", "components/Hosted/Billing.tsx", "lighthouse-runner/index.mjs", "LICENSE-HOSTED", "docs/plans/notes.md"];
// A file or symlink with the folder's exact name, and any LICENSE-HOSTED* name.
const EXACT = ["lib/hosted", "components/Hosted", "lighthouse-runner", "LICENSE-HOSTED.md", "LICENSE-HOSTED.txt", "docs/plans"];

for (const path of [...DENIED, ...EXACT]) {
  test(`a hosted-only path is reported by name, with the fix: ${path}`, () => {
    const v = checkHostedPaths(["README.md", path, "lib/utils.ts"]);
    assert.equal(v.length, 1);
    assert.ok(v[0].startsWith(`${path}: hosted-only path`), v[0]);
    assert.ok(v[0].endsWith(`git rm --cached "${path}"`), v[0]);
  });
}

test("near-misses and the legitimately tracked .env example, .map and factory/ files pass", () => {
  const ok = ["lib/hostedness.ts", "lib/hosted.ts", "docs/plans.md", "components/HostedBadge.tsx", "components/Hosted.tsx", "lighthouse-runner.md", "LICENSE", "LICENSE.md", "lib/lighthouse/run.ts", ".env.local.example", "a.js.map", "factory/jobs/x/spec.md"];
  assert.deepEqual(checkHostedPaths(ok), []);
});

test("CLI: passes on this repo's tracked files", () => {
  const r = run(root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Hosted-path check passed: \d+ tracked files/);
});

// A throwaway repo with `files` (and `links`: path -> symlink target) on disk and only `tracked` added.
function withRepo({ files = [], links = {}, tracked }, fn) {
  const dir = mkdtempSync(join(tmpdir(), "hosted-paths-"));
  try {
    for (const f of files) {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      writeFileSync(join(dir, f), "x\n");
    }
    for (const [link, target] of Object.entries(links)) {
      mkdirSync(dirname(join(dir, link)), { recursive: true });
      symlinkSync(target, join(dir, link));
    }
    for (const args of [["init", "-q"], ["add", ...tracked]]) {
      assert.equal(spawnSync("git", args, { cwd: dir, env: gitlessEnv() }).status, 0, `git ${args.join(" ")}`);
    }
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const offenders = (r) => r.stderr.trim().split("\n").map((l) => l.split(":")[0]).sort();

test("CLI: in a repo with every hosted path tracked, exits 1 with one line per file; untracked files are not checked", () => {
  withRepo({ files: ["README.md", ...DENIED, "docs/plans/untracked.md"], tracked: ["README.md", ...DENIED] }, (dir) => {
    const r = run(join(dir, "docs")); // from a subfolder too: the whole repo is checked
    assert.equal(r.status, 1);
    assert.deepEqual(offenders(r), [...DENIED].sort());
  });
});

test("CLI: a tracked symlink named lib/hosted and a LICENSE-HOSTED.md are reported", () => {
  withRepo({ files: ["README.md", "LICENSE-HOSTED.md"], links: { "lib/hosted": "../../private/lib/hosted" }, tracked: ["README.md", "LICENSE-HOSTED.md", "lib/hosted"] }, (dir) => {
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.deepEqual(offenders(r), ["LICENSE-HOSTED.md", "lib/hosted"]);
  });
});

test("ci.yml runs the check in the check job", () => {
  const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  // Each job starts at a two-space-indented key under jobs:, so this finds the check job whatever follows it.
  const check = ci.split(/\n(?=  \S)/).find((block) => block.startsWith("  check:\n"));
  assert.ok(check, "ci.yml has a check job");
  assert.match(check, /^\s+run: node scripts\/check-hosted-paths\.mjs$/m);
});
