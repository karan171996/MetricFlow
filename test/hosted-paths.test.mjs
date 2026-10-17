// scripts/check-hosted-paths.mjs: hosted-only paths never get committed to this MIT repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkHostedPaths } from "../scripts/check-hosted-paths.mjs";
import { gitlessEnv, root } from "./helpers.mjs";

const script = join(root, "scripts/check-hosted-paths.mjs");
const run = (cwd) => spawnSync(process.execPath, [script], { cwd, encoding: "utf8", env: gitlessEnv() });
const DENIED = ["lib/hosted/db.ts", "components/Hosted/Billing.tsx", "lighthouse-runner/index.mjs", "LICENSE-HOSTED", "docs/plans/notes.md"];

for (const path of DENIED) {
  test(`a hosted-only path is reported by name: ${path}`, () => {
    const v = checkHostedPaths(["README.md", path, "lib/utils.ts"]);
    assert.equal(v.length, 1);
    assert.ok(v[0].startsWith(`${path}: hosted-only path`), v[0]);
  });
}

test("near-misses and the legitimately tracked .env example, .map and factory/ files pass", () => {
  const ok = ["lib/hostedness.ts", "docs/plans.md", "components/HostedBadge.tsx", "lighthouse-runner.md", "LICENSE", "lib/lighthouse/run.ts", ".env.local.example", "a.js.map", "factory/jobs/x/spec.md"];
  assert.deepEqual(checkHostedPaths(ok), []);
});

test("CLI: passes on this repo's tracked files", () => {
  const r = run(root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Hosted-path check passed: \d+ tracked files/);
});

test("CLI: in a repo with every hosted path tracked, exits 1 with one line per file; untracked files are not checked", () => {
  const dir = mkdtempSync(join(tmpdir(), "hosted-paths-"));
  try {
    for (const f of ["README.md", ...DENIED, "docs/plans/untracked.md"]) {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      writeFileSync(join(dir, f), "x\n");
    }
    const git = (...args) => assert.equal(spawnSync("git", args, { cwd: dir, env: gitlessEnv() }).status, 0, `git ${args.join(" ")}`);
    git("init", "-q");
    git("add", "README.md", ...DENIED);
    const r = run(join(dir, "docs")); // from a subfolder too: the whole repo is checked
    assert.equal(r.status, 1);
    assert.deepEqual(r.stderr.trim().split("\n").map((l) => l.split(":")[0]).sort(), [...DENIED].sort());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ci.yml runs the check in the check job", () => {
  const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  const check = ci.slice(ci.indexOf("\n  check:\n"), ci.indexOf("\n  e2e:\n"));
  assert.match(check, /\n        run: node scripts\/check-hosted-paths\.mjs\n/);
});
