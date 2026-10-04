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
    ...(loopback ? {} : { METRICFLOW_EXPOSED: "1" }), // app's isLocalRequest honors this
    ...(process.argv.includes("--no-color") || wantsJson ? { FORCE_COLOR: undefined, NO_COLOR: "1" } : {}),
  },
});
server.on("exit", (code) => {
  stopSpinner();
  if (code) out.error(`Server exited with code ${code}.`, { code: "server_exit", hint: "Check the output above; the port may be in use (try another port)." });
  process.exit(code ?? 0);
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => server.kill(s));

// Open the browser once the port accepts connections.
const open = () => {
  const [cmd, ...args] =
    process.platform === "darwin" ? ["open"] :
    process.platform === "win32" ? ["cmd", "/c", "start", ""] : ["xdg-open"];
  spawn(cmd, [...args, url], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  stopSpinner();
  out.ok("Dashboard is running", { url, host, port: +port });
  out.kv([["URL", url], ["Stop", "Ctrl+C"]]);
};
const poll = () =>
  net.connect(+port, wildcard ? "127.0.0.1" : host).on("connect", function () { this.end(); open(); })
    .on("error", () => setTimeout(poll, 300));
poll();
