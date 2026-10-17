// Tarball guard: fails when the npm tarball ships hosted-only code, secrets or junk, or grows past
// the size ceiling. A published version cannot be pulled back, so this runs before anything ships.
//   node scripts/check-tarball.mjs              lists the package with `npm pack --dry-run` and reads files from disk
//   node scripts/check-tarball.mjs <file.tgz>…  lists and reads each packed tarball with `tar`
// Stdlib only. Exit 1 and one line per violation on failure. Matched secret values are never printed.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Packed (gzipped) size in bytes. On main a3b5080 the publish build (`pnpm run build`, Turbopack) packed to
// 1,842,089 bytes and the CI build (`next build --webpack`) to about 1,440,000, so this leaves about 14%.
// To raise it on purpose: after a clean `pnpm run build`, read `size` from `npm pack --dry-run --json`, check
// that the growth is expected (no new junk in the file list), and set the new size plus headroom here in its own commit.
export const MAX_PACKED_BYTES = 2_100_000;

// The closed-source hosted service and private plans: never in the package, and never in this repo either
// (scripts/check-hosted-paths.mjs runs the same list against `git ls-files`). Matched at any depth, ignoring case.
// (\/|$): the folder's contents and a file or symlink with the folder's exact name, but not lib/hostedness.ts.
export const HOSTED_PATHS = [
  /(^|\/)lib\/hosted(\/|$)/i,
  /(^|\/)components\/Hosted(\/|$)/i,
  /(^|\/)lighthouse-runner(\/|$)/i,
  /(^|\/)LICENSE-HOSTED[^/]*(\/|$)/i,
  /(^|\/)docs\/plans(\/|$)/i,
];

// Matched at any depth under package/, ignoring case. The last three are fine in the repo, not in the package.
const DENIED_PATHS = [
  ...HOSTED_PATHS,
  /(^|\/)\.env[^/]*(\/|$)/i,
  /\.map$/i,
  /(^|\/)factory\//i,
];

// \bsk- skips look-alikes inside words (Next's "after-task-async-storage"). sk-ant- and sk-proj- keys
// carry hyphens and underscores, so they get their own branch.
const SECRET_PATTERNS = [
  ["an API key (sk-)", /\bsk-(?:[A-Za-z0-9]{20,}|(?:ant|proj)-[\w-]{20,})/],
  ["an AWS access key ID", /AKIA[0-9A-Z]{16}/],
  ["a private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["a hosted-only secret name", /METRICFLOW_SECRETS_KEY/],
  ["a hosted-only secret name", /METRICFLOW_LH_RUNNER_SECRET/],
];

// files: paths as they sit in the tarball (package/...). size: packed bytes. read(path): the file's bytes.
export function checkTarball({ files, size, read }) {
  const violations = [];
  for (const file of files) {
    if (DENIED_PATHS.some((re) => re.test(file))) {
      violations.push(`${file}: path is not allowed in the package (remove it, or exclude it in package.json "files")`);
      continue;
    }
    const buf = Buffer.from(read(file));
    if (buf.subarray(0, 8000).includes(0)) continue; // binary (fonts, images): same test git uses
    const text = buf.toString("utf8");
    for (const [label, re] of SECRET_PATTERNS) if (re.test(text)) violations.push(`${file}: content looks like ${label} (matches ${re})`);
  }
  if (size > MAX_PACKED_BYTES) {
    violations.push(`packed size ${size} bytes is over the ceiling of ${MAX_PACKED_BYTES} (MAX_PACKED_BYTES in scripts/check-tarball.mjs; raise it only for expected growth, see CONTRIBUTING.md "Publishing")`);
  }
  return violations;
}

function fromDryRun(root) {
  const cache = join(tmpdir(), "npm-pack-cache"); // same as test/package.test.mjs
  const json = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts", "--cache", cache], { cwd: root, encoding: "utf8" });
  const [{ files, size }] = JSON.parse(json);
  return {
    files: files.map((f) => `package/${f.path}`),
    size,
    read: (file) => readFileSync(join(root, file.slice("package/".length))),
  };
}

function fromTgz(tgz, dir) {
  const files = execFileSync("tar", ["-tzf", tgz], { encoding: "utf8", maxBuffer: 64 << 20 })
    .split("\n")
    .filter((f) => f && !f.endsWith("/"));
  execFileSync("tar", ["-xzf", tgz, "-C", dir]);
  return { files, size: statSync(tgz).size, read: (file) => readFileSync(join(dir, file)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const tgzs = process.argv.slice(2);
  for (const tgz of tgzs.length ? tgzs : [null]) {
    const name = tgz ?? "npm pack --dry-run";
    const dir = tgz && mkdtempSync(join(tmpdir(), "check-tarball-"));
    try {
      const pkg = tgz ? fromTgz(tgz, dir) : fromDryRun(join(import.meta.dirname, ".."));
      const violations = checkTarball(pkg);
      if (violations.length) {
        console.error(`Tarball check failed for ${name} (${violations.length}):`);
        for (const v of violations) console.error(`  ${v}`);
        process.exitCode = 1;
      } else {
        console.log(`Tarball check passed for ${name}: ${pkg.files.length} files, ${pkg.size} bytes packed (ceiling ${MAX_PACKED_BYTES}).`);
      }
    } finally {
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  }
}
