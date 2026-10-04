// Picks the next package.json version from the commit types on this branch (since the base) and writes it.
// Usage: node scripts/bump-version.mjs [--base origin/main] [--dry]
//   breaking (`!` or BREAKING CHANGE) -> major (minor while 0.x) · feat -> minor · fix/perf/refactor/build -> patch
//   docs/style/test/ci/chore/revert only -> no bump
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : "origin/main";
const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();

const pkg = readFileSync("package.json", "utf8");
const current = /"version":\s*"(\d+)\.(\d+)\.(\d+)"/.exec(pkg);
if (!current) throw new Error("package.json has no x.y.z version");
const [major, minor, patch] = current.slice(1).map(Number);

// Already bumped on this branch: leave it alone, so running twice never double-bumps.
const baseVersion = JSON.parse(git("show", `${base}:package.json`)).version;
if (baseVersion !== `${major}.${minor}.${patch}`) {
  console.log(`${major}.${minor}.${patch} (already bumped from ${baseVersion})`);
  process.exit(0);
}

const log = git("log", "--format=%s%n%b%x00", `${base}..HEAD`).split("\0").map((s) => s.trim()).filter(Boolean);
let level = "none";
const rank = { none: 0, patch: 1, minor: 2, major: 3 };
const raise = (l) => { if (rank[l] > rank[level]) level = l; };
for (const msg of log) {
  const m = /^(\w+)(\([^)]*\))?(!)?:/.exec(msg);
  if (!m || /^chore\(release\)/.test(msg)) continue;
  if (m[3] || /^BREAKING CHANGE/m.test(msg)) raise("major");
  else if (m[1] === "feat") raise("minor");
  else if (["fix", "perf", "refactor", "build"].includes(m[1])) raise("patch");
}
if (level === "major" && major === 0) level = "minor"; // 0.x: breaking changes bump the minor

const next = { none: null, patch: [major, minor, patch + 1], minor: [major, minor + 1, 0], major: [major + 1, 0, 0] }[level];
if (!next) {
  console.log(`${major}.${minor}.${patch} (no bump: no feat/fix/breaking commits)`);
  process.exit(0);
}
const version = next.join(".");
if (!dry) writeFileSync("package.json", pkg.replace(current[0], `"version": "${version}"`));
console.log(`${version} (${level} bump from ${major}.${minor}.${patch}${dry ? ", dry run" : ""})`);
