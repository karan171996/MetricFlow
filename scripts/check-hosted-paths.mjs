// Repo guard: fails when a tracked file sits on a hosted-only path. The hosted service is closed source and
// lives in a separate private repo; this repo is MIT, so its code and plans must never be committed here.
//   node scripts/check-hosted-paths.mjs    checks `git ls-files` for the repo the current directory is in
// The paths are HOSTED_PATHS from the tarball guard. Stdlib only. Exit 1 and one line per offending file.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { HOSTED_PATHS } from "./check-tarball.mjs";

// files: repo-relative paths. Returns one message per file on a hosted-only path.
export function checkHostedPaths(files) {
  return files
    .filter((file) => HOSTED_PATHS.some((re) => re.test(file)))
    .map((file) => `${file}: hosted-only path, not allowed in this MIT repo (it belongs in the private hosted repo); untrack it with: git rm --cached "${file}"`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // ":/" and --full-name: the whole repo, root-relative, from any subfolder. -z: no quoting of odd names.
  const files = execFileSync("git", ["ls-files", "-z", "--full-name", ":/"], { encoding: "utf8", maxBuffer: 64 << 20 }).split("\0").filter(Boolean);
  const violations = checkHostedPaths(files);
  for (const v of violations) console.error(v);
  if (violations.length) process.exitCode = 1;
  else console.log(`Hosted-path check passed: ${files.length} tracked files, none on a hosted-only path.`);
}
