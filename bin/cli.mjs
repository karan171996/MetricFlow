#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { helpText, out, wantsHelp, wantsJson, wantsVersion } from "./output.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = createRequire(import.meta.url)("../package.json");
if (wantsHelp) { process.stdout.write(helpText(version)); process.exit(0); }
if (wantsVersion) { console.log(version); process.exit(0); }

// Bind to loopback unless the user opts in: the dashboard serves their New Relic/Sentry data.
const args = process.argv.slice(2);
let host = "127.0.0.1";
const hi = args.findIndex((a) => a === "--host" || a.startsWith("--host="));
if (hi >= 0) {
  const eq = args[hi].startsWith("--host=");
  host = eq ? args[hi].slice(7) : args[hi + 1] ?? "";
  args.splice(hi, eq ? 1 : 2);
  if (!host || host.startsWith("-")) {
    out.error("--host needs an address.", { code: "bad_host", hint: "e.g. --host 0.0.0.0 (all interfaces) or --host 127.0.0.1" });
    process.exit(2);
  }
}
const port = process.env.PORT || args.find((a) => !a.startsWith("-")) || "3000";
if (!/^\d+$/.test(port) || +port > 65535) {
  out.error(`Invalid port "${port}".`, { code: "bad_port", hint: "Use a number from 1 to 65535, e.g. performance-dashboard 4000" });
  process.exit(2);
}
const loopback = ["127.0.0.1", "localhost", "::1"].includes(host);
const wildcard = ["0.0.0.0", "::"].includes(host);
const url = `http://${loopback || wildcard ? "localhost" : host}:${port}`;
if (!loopback) out.warn(`Listening on ${host}: anyone on your network can open the dashboard and see your New Relic/Sentry data.`, { host });
if (!loopback) out.warn("/setup and /connect are disabled while the dashboard is exposed.", { host });

// Use the user's own keys (New Relic, Sentry, ...) from the folder they run this in.
for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}

// Dashboard title: the name of the project this is run in (its package.json name, else the folder name).
let projectName = basename(process.cwd());
try { projectName = JSON.parse(readFileSync("package.json", "utf8")).name || projectName; } catch { /* no package.json here */ }

if (!existsSync(join(root, ".next"))) {
  out.error("No build found.", { code: "no_build", hint: "Run `npm run build` first (published packages include it)." });
  process.exit(1);
}

const stopSpinner = out.spinner(`Starting dashboard on port ${port}`);
const nextBin = join(dirname(createRequire(import.meta.url).resolve("next/package.json")), "dist/bin/next");
const server = spawn(process.execPath, [nextBin, "start", "-p", port, "-H", host], {
  cwd: root,
  stdio: ["inherit", wantsJson ? 2 : "inherit", "inherit"], // keep stdout clean for --json
  // Pass --no-color/--json down so Next's own output matches.
  env: {
    METRICFLOW_PROJECT_NAME: projectName, // set it yourself to override the title
    METRICFLOW_PROJECT_DIR: process.cwd(), // server cwd is the package; writes (.env.local, settings) belong here
    ...process.env,
    // app's isLocalRequest honors this. On loopback it is emptied, so a METRICFLOW_EXPOSED left in the user's shell cannot switch the API guard off.
    METRICFLOW_EXPOSED: loopback ? "" : "1",
    ...(process.argv.includes("--no-color") || wantsJson ? { FORCE_COLOR: undefined, NO_COLOR: "1" } : {}),
  },
});
// True once this process forwarded a stop signal: the server then exits with 128 + signal (143 for
// SIGTERM), which is the shutdown we asked for, not a failure, so it must not print the port hint.
let stopping = false;
server.on("exit", (code) => {
  stopSpinner();
  if (code && !stopping) out.error(`Server exited with code ${code}.`, { code: "server_exit", hint: "Check the output above; the port may be in use (try another port)." });
  process.exit(code ?? 0);
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { stopping = true; server.kill(s); });

/**
 * Prints the chain from the user's site to the dashboard, so "no data" says which
 * link is broken. Reuses /api/connect rather than re-implementing the checks.
 */
async function printConnection() {
  let s;
  try {
    s = await fetch(`http://${loopback || wildcard ? "127.0.0.1" : host}:${port}/api/connect`).then((r) => r.json());
  } catch {
    return; // the dashboard is up; a failed self-check should never hold up startup
  }
  if (!s?.configured) return out.warn("No keys yet. Open /setup to add them.", { configured: false });

  const rows = [
    ["Reading New Relic", s.accountId ? `account ${s.accountId}` : "no account id"],
    ["Browser app", s.setup?.appCount > 0 ? `${s.setup.appName} (application ID ${s.setup.applicationId})` : "none - create one: New Relic > Add data > Browser monitoring"],
    ["Browser key", s.setup?.browserKey ?? "could not read (copy the key VALUE, not the ID beside it)"],
    ["Site sending data", s.browser?.recent > 0 ? "yes, page views arriving" : "no page views yet"],
    ["Custom events", s.custom?.recent > 0 ? "yes" : "none yet"],
    ["Sentry", s.sentry?.error ? s.sentry.error : s.sentry?.recent > 0 ? "errors arriving" : "no errors in the last 5 min"],
  ];
  out.kv(rows, { event: "connection", ...s });
  if (!(s.browser?.recent > 0)) {
    if (!(s.setup?.appCount > 0)) out.warn("New Relic is not receiving data: no Browser app exists yet, so your site has no application ID to send to.", { reason: "no_browser_app" });
    else out.warn("New Relic is not receiving data. Load your site, then check for blocked requests to nr-data.net - ad and privacy blockers drop them silently.", { reason: "no_page_views" });
  }
}

// Open the browser once the port accepts connections (--no-open skips it: tests, CI, remote shells).
const open = () => {
  const [cmd, ...args] =
    process.platform === "darwin" ? ["open"] :
    process.platform === "win32" ? ["cmd", "/c", "start", ""] : ["xdg-open"];
  if (!process.argv.includes("--no-open")) spawn(cmd, [...args, url], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  stopSpinner();
  out.ok("Dashboard is running", { url, host, port: +port });
  out.kv([["URL", url], ["Stop", "Ctrl+C"]]);
};
const poll = () =>
  net.connect(+port, wildcard ? "127.0.0.1" : host).on("connect", function () { this.end(); open(); printConnection(); })
    .on("error", () => setTimeout(poll, 300));
poll();
