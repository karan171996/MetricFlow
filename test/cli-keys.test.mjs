// The startup summary must not put the New Relic browser key / application ID in full into captured
// output (logs, CI). Runs the real bin/cli.mjs against a stub `next start` that serves a canned
// /api/connect, so no build is needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const KEY = "NRJS-FAKEBROWSERKEY99";
const APP = "1134567890";
const HINT = "full values: open /connect";
const connect = (setup) => ({ configured: true, tools: ["new-relic"], accountId: "42", browser: { recent: 3 }, custom: { recent: 0 }, setup: { appCount: 1, appName: "Shop", applicationId: APP, browserKey: KEY, ...setup } });

// Package copy: bin/ + package.json + an empty .next, and a stub next whose `start` answers every request with $FAKE_CONNECT.
const dir = mkdtempSync(join(tmpdir(), "cli-keys-"));
cpSync(join(import.meta.dirname, "../bin"), join(dir, "bin"), { recursive: true });
cpSync(join(import.meta.dirname, "../package.json"), join(dir, "package.json"));
mkdirSync(join(dir, ".next"));
mkdirSync(join(dir, "node_modules/next/dist/bin"), { recursive: true });
writeFileSync(join(dir, "node_modules/next/package.json"), '{"name":"next"}');
writeFileSync(join(dir, "node_modules/next/dist/bin/next"), 'const a = process.argv;\nrequire("node:http").createServer((q, r) => r.end(process.env.FAKE_CONNECT)).listen(+a[a.indexOf("-p") + 1], a[a.indexOf("-H") + 1]);\n');
// Preload that makes the CLI see a terminal on stdout (node has no pty, so this stands in for one).
writeFileSync(join(dir, "tty.mjs"), 'Object.defineProperty(process.stdout, "isTTY", { value: true });\n');
const asTTY = ["--import", pathToFileURL(join(dir, "tty.mjs")).href];

const freePort = () => new Promise((res) => { const s = createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(String(port))); }); });

/** Starts the CLI, returns its stdout and stderr once the connection summary is printed, then stops it. */
async function start(setup, flags = [], nodeArgs = []) {
  const p = spawn(process.execPath, [...nodeArgs, join(dir, "bin/cli.mjs"), await freePort(), "--no-open", ...flags], {
    cwd: dir,
    env: { PATH: process.env.PATH, NO_COLOR: "1", FAKE_CONNECT: JSON.stringify(connect(setup)) },
  });
  let out = "", err = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (err += d));
  const exited = new Promise((res) => p.once("exit", res));
  try {
    await new Promise((res, rej) => {
      const t = setInterval(() => /(Sentry|"event":"connection").*\n/.test(out) && (clearInterval(t), res()), 50);
      exited.then(() => { clearInterval(t); rej(new Error(`CLI exited early:\n${out}\n${err}`)); });
    });
    return { out, err };
  } finally {
    p.kill("SIGTERM");
    await exited;
  }
}
const connection = (out) => out.trim().split("\n").map((l) => JSON.parse(l)).find((e) => e.event === "connection");

test("captured stdout: browser key and app ID are masked, with a pointer to /connect", { timeout: 20000 }, async () => {
  const { out } = await start();
  assert.ok(!out.includes(KEY) && !out.includes(APP), `full value printed:\n${out}`);
  assert.match(out, /Browser app {8}Shop \(application ID 1134567…\)/);
  assert.match(out, /Browser key {8}NRJS-FA…\n {21}full values: open \/connect\n/);
});

test("captured stdout with --show-keys: full values, no hint", { timeout: 20000 }, async () => {
  const { out } = await start({}, ["--show-keys"]);
  assert.ok(out.includes(`application ID ${APP})`) && out.includes(`Browser key        ${KEY}\n`), out);
  assert.ok(!out.includes(HINT));
});

test("terminal stdout: full values with no flag; --json on a terminal is still masked", { timeout: 20000 }, async () => {
  const { out } = await start({}, [], asTTY);
  assert.ok(out.includes(`application ID ${APP})`) && out.includes(`Browser key        ${KEY}\n`), out);
  assert.ok(!out.includes(HINT));
  const j = await start({}, ["--json"], asTTY);
  assert.equal(connection(j.out).setup.browserKey, "NRJS-FA…");
});

test("--json: connection event masks only setup.browserKey/applicationId; --show-keys gives full values", { timeout: 20000 }, async () => {
  const { out } = await start({}, ["--json"]);
  assert.ok(!out.includes(KEY) && !out.includes(APP), out);
  for (const l of out.trim().split("\n")) JSON.parse(l); // every line is one JSON object
  const full = connect();
  assert.deepEqual(connection(out), { event: "connection", ...full, setup: { ...full.setup, applicationId: "1134567…", browserKey: "NRJS-FA…" } });
  assert.deepEqual(connection((await start({}, ["--json", "--show-keys"])).out), { event: "connection", ...full });
});

test("no browser key: 'could not read' message unchanged; short app IDs never shown whole", { timeout: 20000 }, async () => {
  const { out, err } = await start({ browserKey: null, applicationId: "123456" });
  assert.match(out, /Browser key {8}could not read \(copy the key VALUE, not the ID beside it\)\n/);
  assert.match(out, /application ID 123…\)/);
  assert.ok(!out.includes("123456") && out.includes(HINT));
  assert.ok(!/Error/.test(err), err);
  const j = connection((await start({ browserKey: null, applicationId: "42" }, ["--json"])).out);
  assert.equal(j.setup.browserKey, null);
  assert.equal(j.setup.applicationId, "…");
});
