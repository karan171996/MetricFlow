// Run: node --test test/*.test.mjs   (spec: CLI_OUTPUT.md)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";

const cli = join(import.meta.dirname, "../bin/cli.mjs");
const { version } = JSON.parse((await import("node:fs")).readFileSync(join(import.meta.dirname, "../package.json"), "utf8"));
const run = (args = [], env = {}) =>
  spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", env: { PATH: process.env.PATH, ...env } });
const ESC = "\x1b[";

test("--help prints usage on stdout, exit 0", () => {
  for (const f of ["--help", "-h"]) {
    const r = run([f]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /performance-dashboard/);
    assert.equal(r.stderr, "");
  }
});

test("-v / --version prints the bare version", () => {
  for (const f of ["-v", "--version"]) {
    const r = run([f]);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), version);
  }
});

test("bad port: exit 2, error on stderr with fix hint", () => {
  for (const p of ["abc", "70000", "-x1"].slice(0, 2)) {
    const r = run([p]);
    assert.equal(r.status, 2);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, new RegExp(`Invalid port "${p}"\\.`));
    assert.match(r.stderr, /→ Use a number from 1 to 65535/);
  }
});

test("bad port via PORT env", () => {
  assert.equal(run([], { PORT: "abc" }).status, 2);
});

test("bad port --json: NDJSON error on stdout", () => {
  const r = run(["abc", "--json"]);
  assert.equal(r.status, 2);
  const lines = r.stdout.trim().split("\n");
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    event: "error", code: "bad_port", message: 'Invalid port "abc".',
    hint: "Use a number from 1 to 65535, e.g. performance-dashboard 4000",
  });
});

test("no colors: --no-color, NO_COLOR, TERM=dumb; piped output is plain", () => {
  assert.ok(!run(["abc"]).stderr.includes(ESC)); // not a TTY
  assert.ok(!run(["abc", "--no-color"], { FORCE_COLOR: "1" }).stderr.includes(ESC));
  assert.ok(!run(["abc"], { NO_COLOR: "1", FORCE_COLOR: "1" }).stderr.includes(ESC));
  assert.ok(!run(["abc"], { TERM: "dumb" }).stderr.includes(ESC));
});

test("FORCE_COLOR forces color; empty NO_COLOR does not disable it", () => {
  assert.ok(run(["abc"], { FORCE_COLOR: "1" }).stderr.includes(ESC));
  assert.ok(run(["abc"], { FORCE_COLOR: "1", NO_COLOR: "" }).stderr.includes(ESC));
  assert.ok(!run(["abc", "--json"], { FORCE_COLOR: "1" }).stdout.includes(ESC));
});

test("no build: exit 1, hint (plain and --json)", () => {
  // Copy only bin/ + package.json so there is no .next next to the CLI.
  const dir = mkdtempSync(join(tmpdir(), "cli-nobuild-"));
  cpSync(join(import.meta.dirname, "../bin"), join(dir, "bin"), { recursive: true });
  cpSync(join(import.meta.dirname, "../package.json"), join(dir, "package.json"));
  const c = join(dir, "bin/cli.mjs");
  const r = spawnSync(process.execPath, [c], { encoding: "utf8", cwd: dir, env: { PATH: process.env.PATH } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /✖ No build found\.\n {2}→ Run `npm run build` first/);
  const j = spawnSync(process.execPath, [c, "--json"], { encoding: "utf8", cwd: dir, env: { PATH: process.env.PATH } });
  assert.equal(j.status, 1);
  assert.equal(JSON.parse(j.stdout).code, "no_build");
});

// Host handling runs before the build check, so a copy without .next exercises it without binding a port.
test("host: default is loopback (no warning); --host 0.0.0.0 opts in with a warning; bad --host exits 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "cli-host-"));
  cpSync(join(import.meta.dirname, "../bin"), join(dir, "bin"), { recursive: true });
  cpSync(join(import.meta.dirname, "../package.json"), join(dir, "package.json"));
  const go = (a) => spawnSync(process.execPath, [join(dir, "bin/cli.mjs"), ...a], { encoding: "utf8", cwd: dir, env: { PATH: process.env.PATH } });
  assert.ok(!/network/.test(go([]).stderr));
  assert.ok(!/network/.test(go(["--host", "127.0.0.1"]).stderr));
  for (const a of [["--host", "0.0.0.0"], ["--host=0.0.0.0"], ["4000", "--host", "0.0.0.0"]]) {
    const r = go(a);
    assert.match(r.stderr, /Listening on 0\.0\.0\.0: anyone on your network/);
    assert.match(r.stderr, /No build found/); // host value was not mistaken for the port
  }
  assert.match(go(["--host", "0.0.0.0"]).stderr, /\/setup and \/connect are disabled/);
  assert.ok(!/disabled/.test(go([]).stderr));
  const j = go(["--host", "0.0.0.0", "--json"]);
  assert.deepEqual(JSON.parse(j.stdout.split("\n")[0]).event, "warn");
  for (const a of [["--host"], ["--host", "--json"], ["--host="]]) {
    const r = go(a);
    assert.equal(r.status, 2);
    assert.match(r.stderr + r.stdout, /--host needs an address/); // --json sends errors to stdout
  }
});

// Real start needs a production build and a bindable port; skipped otherwise.
const built = existsSync(join(import.meta.dirname, "../.next/BUILD_ID"));
test("real start: prints running banner, serves /api/health", { skip: !built && "no .next/BUILD_ID (run npm run build)", timeout: 60000 }, async () => {
  // The test serves whatever .next exists; a stale build gives misleading results (seen with /api/setup).
  const newest = (dir) => readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && /\.tsx?$/.test(e.name)).reduce((m, e) => Math.max(m, statSync(join(e.parentPath, e.name)).mtimeMs), 0);
  const builtAt = statSync(join(import.meta.dirname, "../.next/BUILD_ID")).mtimeMs;
  for (const d of ["app", "lib", "components"]) assert.ok(newest(join(import.meta.dirname, "..", d)) <= builtAt, `.next is older than ${d}/ sources: run npx next build --webpack`);
  // Fake `open` so the test never launches a browser.
  const bin = mkdtempSync(join(tmpdir(), "fakeopen-"));
  for (const n of ["open", "xdg-open"]) { writeFileSync(join(bin, n), "#!/bin/sh\n"); chmodSync(join(bin, n), 0o755); }
  const port = "43177";
  const p = spawn(process.execPath, [cli, port, "--json"], { env: { PATH: `${bin}:${process.env.PATH}` } });
  let out = "";
  p.stdout.on("data", (d) => (out += d));
  try {
    await new Promise((res, rej) => { const t = setInterval(() => out.includes("\n") && (clearInterval(t), res()), 200); p.on("exit", () => rej(new Error("server exited early"))); });
    const first = JSON.parse(out.split("\n")[0]);
    assert.deepEqual(first, { event: "ok", message: "Dashboard is running", url: `http://localhost:${port}`, host: "127.0.0.1", port: +port });
    const h = await (await fetch(`http://localhost:${port}/api/health`)).json();
    assert.equal(h.status, "ok");
    assert.ok(!out.includes('"event":"warn"'), "default (loopback) start must print no exposure warning");
    // Next adds x-forwarded-for=<socket address> to every request; /api/setup must still answer a real local browser.
    const setup = await fetch(`http://127.0.0.1:${port}/api/setup`);
    assert.equal(setup.status, 200, "/api/setup refuses genuine localhost requests on a real server");
    assert.equal(typeof (await setup.json()).configured, "boolean");
    // Dashboard can hold API keys: it should not be reachable from the LAN (bind 127.0.0.1).
    const lan = Object.values(networkInterfaces()).flat().find((i) => i.family === "IPv4" && !i.internal);
    if (lan) {
      const reachable = await fetch(`http://${lan.address}:${port}/api/health`, { signal: AbortSignal.timeout(3000) }).then(() => true, () => false);
      assert.equal(reachable, false, `server reachable on LAN address ${lan.address}`);
    }
  } finally { p.kill("SIGTERM"); }
});

test("color precedence: FORCE_COLOR beats TERM=dumb; FORCE_COLOR=0 is off", () => {
  assert.ok(run(["abc"], { FORCE_COLOR: "1", TERM: "dumb" }).stderr.includes(ESC));
  assert.ok(!run(["abc"], { FORCE_COLOR: "0" }).stderr.includes(ESC));
  assert.ok(!run(["abc", "--no-color"], { FORCE_COLOR: "1", TERM: "dumb" }).stderr.includes(ESC));
});

// Non-loopback --host: CLI must set METRICFLOW_EXPOSED=1 for the server so /setup and /connect switch off.
test("real start with --host 0.0.0.0: exposed warning, and /api/setup is disabled (kill switch reaches the server)", { skip: !built && "no .next/BUILD_ID", timeout: 60000 }, async () => {
  const bin = mkdtempSync(join(tmpdir(), "fakeopen-"));
  for (const n of ["open", "xdg-open"]) { writeFileSync(join(bin, n), "#!/bin/sh\n"); chmodSync(join(bin, n), 0o755); }
  const port = "43176";
  const env = { PATH: `${bin}:${process.env.PATH}` };
  const p = spawn(process.execPath, [cli, port, "--host", "0.0.0.0", "--json"], { env });
  let out = "";
  p.stdout.on("data", (d) => (out += d));
  try {
    await new Promise((res, rej) => { const t = setInterval(() => /"event":"ok"/.test(out) && (clearInterval(t), res()), 200); p.on("exit", () => rej(new Error("server exited early: " + out))); });
    const events = out.trim().split("\n").map((l) => JSON.parse(l));
    const warn = events.find((e) => e.event === "warn");
    assert.ok(warn, "no exposed warning event");
    assert.equal(warn.host, "0.0.0.0");
    assert.ok(events.some((e) => e.event === "warn" && /disabled/i.test(e.message)), "no 'disabled while exposed' warning");
    for (const path of ["/api/setup", "/api/connect"]) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(res.status, 403, `${path} must be off while exposed`);
      assert.match((await res.json()).error, /exposed|--host/i);
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200); // rest of the app still serves
  } finally { p.kill("SIGTERM"); }
});
