// Tests .claude/hooks/pre-commit-validate-package.sh (needs bash + jq)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = join(import.meta.dirname, "..");
const hook = (payload) =>
  spawnSync("bash", [".claude/hooks/pre-commit-validate-package.sh"], {
    cwd: root, input: JSON.stringify(payload), encoding: "utf8",
    env: { PATH: process.env.PATH, npm_config_cache: join(tmpdir(), "npm-pack-cache") },
  });

test("non-commit command passes silently", () => {
  const r = hook({ tool_input: { command: "ls" } });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, "");
});

test("git commit with a valid package passes", () => {
  const r = hook({ tool_input: { command: "git commit -m x" } });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /Package validation passed/);
});

// Claude Code sends the command as tool_input.command, not parameters.command.
test("hook fires on the real Claude Code payload shape (tool_input.command)", () => {
  const r = hook({ tool_name: "Bash", tool_input: { command: "git commit -m x" } });
  assert.match(r.stderr, /Validating npm package/, "hook ignored tool_input.command, so it never runs in practice");
});

// Fake `npm` on PATH so we control what `npm pack` returns.
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
const withFakeNpm = (script, command = "git commit -m x") => {
  const dir = mkdtempSync(join(tmpdir(), "fakenpm-"));
  writeFileSync(join(dir, "npm"), `#!/bin/sh\n${script}\n`);
  chmodSync(join(dir, "npm"), 0o755);
  return spawnSync("bash", [".claude/hooks/pre-commit-validate-package.sh"], {
    cwd: root, encoding: "utf8", input: JSON.stringify({ tool_input: { command } }),
    env: { PATH: `${dir}:${process.env.PATH}` },
  });
};
const packJson = (...paths) => `echo '${JSON.stringify([{ files: paths.map((path) => ({ path })) }])}'`;

test("npm pack failure (EPERM) warns but allows the commit", () => {
  const r = withFakeNpm("echo 'npm error EPERM' >&2; exit 1");
  assert.equal(r.status, 0);
  assert.match(r.stderr, /npm pack failed: .*EPERM/);
});

test("non-JSON npm output warns but allows the commit", () => {
  const r = withFakeNpm("echo not-json");
  assert.equal(r.status, 0);
  assert.match(r.stderr, /not valid JSON/);
});

test("missing bin/cli.mjs blocks the commit (exit 2)", () => {
  const r = withFakeNpm(packJson("package.json"));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /bin\/cli\.mjs missing/);
});

test("leaked .next/dev or .next/cache blocks the commit (exit 2)", () => {
  for (const leak of [".next/dev/x.js", ".next/cache/y"]) {
    const r = withFakeNpm(packJson("bin/cli.mjs", leak));
    assert.equal(r.status, 2, leak);
    assert.match(r.stderr, /leaked/);
  }
});
