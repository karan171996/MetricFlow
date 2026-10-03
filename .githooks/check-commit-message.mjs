#!/usr/bin/env node
// One rule for commit messages and PR titles: "type(scope): description" (Conventional Commits).
// Used by .githooks/commit-msg (git passes a file) and .github/workflows/pr-title.yml (passes --text).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const TYPES = ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert"];
const HEADER = new RegExp(`^(${TYPES.join("|")})(\\([a-z0-9][a-z0-9._/-]*\\))?!?: \\S`);
const MAX_LENGTH = 72;

/** null when the message is fine, otherwise one line saying what to fix. */
export function problem(message) {
  const header = message.split("\n")[0].trim();
  if (/^(Merge |Revert ")/.test(header) || /^(fixup|squash)! /.test(header)) return null; // written by git itself
  if (!HEADER.test(header)) return `"${header}" must look like "type(scope): description". Types: ${TYPES.join(", ")}. Example: "fix(api): handle empty New Relic response".`;
  if (header.length > MAX_LENGTH) return `The first line is ${header.length} characters; keep it to ${MAX_LENGTH} or fewer.`;
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [flag, value] = process.argv.slice(2);
  const raw = flag === "--text" ? value ?? "" : readFileSync(flag, "utf8");
  const message = raw.split("\n").filter((l) => !l.startsWith("#")).join("\n").trim(); // git adds '#' comment lines
  const found = problem(message);
  if (found) {
    console.error(`BLOCKED: ${found}\nSee CONTRIBUTING.md for the format.`);
    process.exit(1);
  }
}
