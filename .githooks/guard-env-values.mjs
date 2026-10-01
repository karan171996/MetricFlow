#!/usr/bin/env node
// Blocks any real secret VALUE from .env.local appearing in content headed for a commit or push.
// Usage: guard-env-values.mjs staged   (scans `git diff --cached`)
//        guard-env-values.mjs stdin    (scans a diff/log on stdin, e.g. `git log -p`)
// Output names the variable and file only. Values are never printed.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const envFile = process.env.GUARD_ENV_FILE || ".env.local";
if (!existsSync(envFile)) process.exit(0); // other machine / CI: the pattern scan still applies

const SECRETISH = /KEY|TOKEN|SECRET|DSN|PASS/i; // names whose values are secrets (not org slug / ids)
const secrets = [];
for (const line of readFileSync(envFile, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!m || !SECRETISH.test(m[1])) continue;
  const v = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  if (v.length >= 8 && !/^(FAKE-|your_)/i.test(v)) secrets.push([m[1], v]);
}
if (!secrets.length) process.exit(0);

const text =
  process.argv[2] === "stdin"
    ? readFileSync(0, "latin1")
    : execFileSync("git", ["diff", "--cached", "-U0", "--no-color"], { maxBuffer: 1 << 29 }).toString("latin1");

let file = "(unknown file)";
const hits = new Set();
for (const line of text.split("\n")) {
  if (line.startsWith("+++ ")) { file = line.slice(4).replace(/^b\//, ""); continue; }
  if (!line.startsWith("+")) continue;
  for (const [name, v] of secrets) if (line.includes(v)) hits.add(`${name} in ${file}`);
}
if (hits.size) {
  console.error(`BLOCKED: real value(s) from .env.local found in content to be committed/pushed:\n  ${[...hits].join("\n  ")}`);
  process.exit(1);
}
