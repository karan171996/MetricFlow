// scripts/check-tarball.mjs: the pure check on fixtures, the CLI on real .tgz files, and the real package.
// Secret-shaped fixtures are built at run time so this file itself never holds a key-shaped string.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkTarball, MAX_PACKED_BYTES } from "../scripts/check-tarball.mjs";

const root = join(import.meta.dirname, "..");
const script = join(root, "scripts/check-tarball.mjs");
const TODAY = 1_445_667; // 0.15.0 packed size, main a3b5080

const clean = {
  "package/package.json": '{"name":"x","version":"1.0.0"}',
  "package/bin/cli.mjs": "#!/usr/bin/env node\nconsole.log('task-async-storage sk-short');\n",
  "package/public/logo.svg": "<svg/>",
  "package/.next/server/app/page.js": "const env = process.env.METRICFLOW_PROJECT_DIR;",
  "package/.next/static/media/font.woff2": Buffer.from([0x77, 0x4f, 0x46, 0x32, 0, 1, 2]),
};
const check = (fixture, size = TODAY) => checkTarball({ files: Object.keys(fixture), size, read: (f) => fixture[f] });

test("a clean file list of normal size has no violations", () => {
  assert.deepEqual(check(clean), []);
});

for (const path of [
  "package/lib/hosted/x.js",
  "package/components/Hosted/A.js",
  "package/lighthouse-runner/index.js",
  "package/LICENSE-HOSTED",
  "package/.env.local",
  "package/.next/static/a.js.map",
  "package/factory/jobs/x/spec.md",
  "package/docs/plans/commercialisation.md",
]) {
  test(`denylisted path is reported: ${path}`, () => {
    const v = check({ ...clean, [path]: "ok" });
    assert.equal(v.length, 1);
    assert.match(v[0], new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: `));
  });
}

test("denylisted paths match at any depth, not as look-alikes", () => {
  assert.equal(check({ ...clean, "package/.next/server/lib/hosted/db.js": "" }).length, 1);
  assert.deepEqual(check({ ...clean, "package/public/factory-logo.svg": "", "package/bin/environment.mjs": "" }), []);
});

const secrets = {
  sk: "sk-" + "Ab3".repeat(8),
  "sk-ant": "sk-" + "ant-api03-" + "x_Y-".repeat(6),
  AKIA: "AKIA" + "ABCDEFGH23456789",
  "private key": "-----BEGIN " + "RSA PRIVATE KEY-----",
  METRICFLOW_SECRETS_KEY: "METRICFLOW_" + "SECRETS_KEY",
  METRICFLOW_LH_RUNNER_SECRET: "METRICFLOW_" + "LH_RUNNER_SECRET",
};
for (const [name, value] of Object.entries(secrets)) {
  test(`secret content is reported with file and pattern: ${name}`, () => {
    const v = check({ ...clean, "package/.next/server/chunks/1.js": `var a="${value}";` });
    assert.equal(v.length, 1);
    assert.match(v[0], /^package\/\.next\/server\/chunks\/1\.js: content matches \/.+\/$/);
    // A name is its own pattern; a key's value must stay out of CI logs.
    if (!value.startsWith("METRICFLOW_")) assert.ok(!v[0].includes(value), "the matched value itself is never printed");
  });
}

test("the same content without a secret has no violations", () => {
  assert.deepEqual(check({ ...clean, "package/.next/server/chunks/1.js": 'var a="sk-short",b="AKIA",c="-----BEGIN PUBLIC KEY-----",d="METRICFLOW_SECRETS";' }), []);
});

test("binary files are not scanned", () => {
  assert.deepEqual(check({ ...clean, "package/public/x.png": Buffer.concat([Buffer.from([0]), Buffer.from(secrets.sk)]) }), []);
});

test("a packed size over the ceiling is reported; today's size is not", () => {
  assert.equal(MAX_PACKED_BYTES, 1_700_000);
  assert.deepEqual(check(clean, TODAY), []);
  assert.deepEqual(check(clean, MAX_PACKED_BYTES), []);
  const v = check(clean, MAX_PACKED_BYTES + 1);
  assert.equal(v.length, 1);
  assert.match(v[0], /packed size 1700001 bytes is over the ceiling of 1700000/);
});

const packTgz = (fixture) => {
  const dir = mkdtempSync(join(tmpdir(), "tarball-guard-"));
  for (const [f, body] of Object.entries(fixture)) {
    mkdirSync(join(dir, "src", dirname(f)), { recursive: true });
    writeFileSync(join(dir, "src", f), body);
  }
  const tgz = join(dir, "pkg.tgz");
  execFileSync("tar", ["-czf", tgz, "-C", join(dir, "src"), "package"]);
  return { tgz, dir };
};
const runCli = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });

test("CLI: exits 0 on a clean .tgz and 1 on a bad one, naming each violation", () => {
  const good = packTgz(clean);
  const bad = packTgz({ ...clean, "package/lib/hosted/x.js": "", "package/bin/key.mjs": `const k = "${secrets.AKIA}";` });
  try {
    const ok = runCli(good.tgz);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /Tarball check passed: 5 files/);
    const r = runCli(bad.tgz);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /package\/lib\/hosted\/x\.js: path is not allowed/);
    assert.match(r.stderr, /package\/bin\/key\.mjs: content matches \/AKIA/);
  } finally {
    rmSync(good.dir, { recursive: true, force: true });
    rmSync(bad.dir, { recursive: true, force: true });
  }
});

test("CLI dry-run mode passes on the real package (no false positives)", { skip: !existsSync(join(root, ".next/BUILD_ID")) && "no .next/BUILD_ID (run npm run build)" }, () => {
  const r = runCli();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Tarball check passed/);
});

test("ci.yml runs the dry-run check in the check job, after the build", () => {
  const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  const check = ci.slice(ci.indexOf("\n  check:\n"), ci.indexOf("\n  e2e:\n"));
  const run = check.indexOf("run: node scripts/check-tarball.mjs\n");
  assert.ok(run > 0, "check job runs node scripts/check-tarball.mjs");
  assert.ok(run > check.indexOf("run: pnpm run build:browser"), "after the browser entry is built");
});
