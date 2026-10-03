#!/usr/bin/env node
// Usage: node scripts/test-env.mjs basic|real
// basic: fake keys from .env.test.example, no network, never reads .env.local.
// real:  real keys from .env.local, read in this process only (never copied or printed).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, mkdtempSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
if (!["basic", "real"].includes(mode)) { console.error("Usage: node scripts/test-env.mjs basic|real"); process.exit(2); }

let keys;
if (mode === "basic") {
  keys = parseEnv(readFileSync(join(root, ".env.test.example"), "utf8"));
} else {
  const f = join(root, ".env.local");
  if (!existsSync(f)) { console.error("test:real needs real keys: .env.local not found. Create it from .env.local.example, then rerun."); process.exit(1); }
  keys = parseEnv(readFileSync(f, "utf8"));
}
// Explicit values win over Next's own .env.local loading; the env file for /setup writes goes to a temp file in basic mode.
const env = { ...process.env, ...keys, ...(mode === "basic" ? { METRICFLOW_ENV_FILE: join(mkdtempSync(join(tmpdir(), "mf-env-")), ".env.local") } : {}) };
const run = (cmd, args, extra = {}) => spawnSync(cmd, args, { cwd: root, env, stdio: "inherit", ...extra }).status ?? 1;

const nodeTests = mode === "basic"
  ? ["--experimental-test-module-mocks", "--import", "./test/register.mjs", "--test", "test/*.test.mjs"]
  : ["--experimental-test-module-mocks", "--import", "./test/register.mjs", "--test", "test/live/*.test.mjs"];
if (run(process.execPath, nodeTests)) process.exit(1);

const specs = mode === "real"
  ? ["cypress/e2e/live-metrics.cy.ts"]
  : readdirSync(join(root, "cypress/e2e")).filter((s) => s !== "live-metrics.cy.ts").map((s) => `cypress/e2e/${s}`);

if (run("pnpm", ["exec", "next", "build"])) process.exit(1);
const port = await new Promise((res) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const server = spawn(process.execPath, ["bin/cli.mjs", "--no-open", String(port)], { cwd: root, env: { ...env, PORT: String(port) }, stdio: "inherit" });
let code = 1;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://localhost:${port}/api/health`)).ok) break; } catch {}
    if (i > 60) throw new Error("server did not become healthy in 60s");
    await new Promise((r) => setTimeout(r, 1000));
  }
  code = run("pnpm", ["exec", "cypress", "run",`--config=baseUrl=http://localhost:${port}`, `--spec=${specs.join(",")}`]);
} catch (e) { console.error(e.message); } finally { server.kill("SIGTERM"); }
process.exit(code);
