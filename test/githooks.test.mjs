// .githooks/secret-scan.sh in a throwaway git repo. Fake tokens are built at runtime so this file never trips the scanner itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { root } from "./helpers.mjs";

const scan = join(root, ".githooks/secret-scan.sh");
const sh = (cwd, cmd) => spawnSync("sh", ["-c", cmd], { cwd, encoding: "utf8" });
function stage(files) {
  const dir = mkdtempSync(join(tmpdir(), "mf-hook-"));
  sh(dir, "git init -q && git config user.email t@t && git config user.name t");
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  sh(dir, "git add -A");
  return spawnSync("sh", [scan], { cwd: dir, encoding: "utf8" });
}
const FAKE_GH = "ghp_" + "a1B2".repeat(9);
const FAKE_NR = "NRAK-" + "A1B2C3D4E5".repeat(3);

test("clean change passes", () => assert.equal(stage({ "a.ts": "export const x = 1;\n" }).status, 0));

test("staged .env.local / .env / .pem are blocked", () => {
  for (const f of [".env.local", ".env", ".env.production", "certs/key.pem"]) {
    const r = stage({ [f]: "X=1\n" });
    assert.equal(r.status, 1, f);
    assert.match(r.stdout, /BLOCKED: secret-bearing file/);
  }
});

test(".env.local.example stays allowed", () => assert.equal(stage({ ".env.local.example": "NEWRELIC_API_KEY=\n" }).status, 0));

test("token-looking strings in staged additions are blocked, and redacted in the output", () => {
  for (const tok of [FAKE_GH, FAKE_NR, "sk-" + "x1".repeat(15)]) {
    const r = stage({ "src.ts": `const t = "${tok}";\n` });
    assert.equal(r.status, 1, tok.slice(0, 5));
    assert.match(r.stdout, /BLOCKED: possible token/);
    assert.ok(!r.stdout.includes(tok), "scanner echoed the secret");
  }
});

test("key assignments with long values are blocked; short placeholders pass", () => {
  assert.equal(stage({ "c.ts": `const api_key = "${"z9".repeat(14)}";\n` }).status, 1);
  assert.equal(stage({ "c.ts": `const api_key = "";\n`, "d.md": "set NEWRELIC_API_KEY=your-key-here\n" }).status, 0);
});
