#!/usr/bin/env node
// Commit guard for staged Markdown: catches the mistakes that make a preview stop rendering or render wrong.
// Checks the staged copy (git show :path), not the working tree. No dependencies.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Problems in one Markdown text, as "line N: message" strings. `exists(path)` checks relative links. */
export function problems(text, exists = () => true) {
  const out = [];
  const lines = text.split("\n");
  let fence = null; // line number of the open ``` fence
  let cols = 0; // cell count of the current table's header row
  let comment = null; // line number of an open <!--

  lines.forEach((line, i) => {
    const n = i + 1;
    if (/^\s*(```|~~~)/.test(line)) { fence = fence ? null : n; return; }
    if (fence) return;

    if (comment === null && line.includes("<!--") && !line.slice(line.lastIndexOf("<!--")).includes("-->")) comment = n;
    else if (comment !== null && line.includes("-->")) comment = null;

    // Table rows: same number of cells as the header. Pipes inside `code` or escaped as \| don't count.
    if (line.trimStart().startsWith("|")) {
      const cells = line.replace(/`[^`]*`/g, "").replace(/\\\|/g, "").trim().replace(/^\||\|$/g, "").split("|").length;
      if (!cols) cols = cells;
      else if (cells !== cols) out.push(`line ${n}: table row has ${cells} cells, header has ${cols}`);
    } else cols = 0;

    for (const [, target] of line.replace(/`[^`]*`/g, "").matchAll(/\]\(([^)\s]+)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const path = decodeURIComponent(target.split("#")[0]);
      if (path && !exists(path)) out.push(`line ${n}: link or image points to a missing file: ${path}`);
    }
  });

  if (fence) out.push(`line ${fence}: code fence is never closed, so everything after it renders as code`);
  if (comment !== null) out.push(`line ${comment}: <!-- comment is never closed, so everything after it is hidden`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
  const root = git("rev-parse", "--show-toplevel").trim();
  const files = git("diff", "--cached", "--name-only", "--diff-filter=ACMR").split("\n").filter((f) => /\.md$/i.test(f));
  let failed = false;
  for (const f of files) {
    const found = problems(git("show", `:${f}`), (p) => existsSync(join(root, dirname(f), p)));
    if (found.length) { failed = true; console.log(`BLOCKED: ${f} will not render correctly:\n  ${found.join("\n  ")}`); }
  }
  process.exit(failed ? 1 : 0);
}
