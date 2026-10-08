// A workflow file that is not valid YAML never starts: GitHub reports the run as failed with no jobs,
// and the checks simply do not appear on a pull request. That went unnoticed for ten pushes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "../.github/workflows");

test("workflows: an unquoted value never contains ': ' (YAML reads that as a second key)", () => {
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.includes("ci.yml"));
  for (const file of files) {
    readFileSync(join(dir, file), "utf8").split("\n").forEach((line, i) => {
      // `key: value` lines only; block scalars (run: |) and quoted or bracketed values are fine.
      const m = /^\s*(?:- )?[\w-]+: (?!["'|>\[{])(.*)$/.exec(line);
      if (!m) return;
      const value = m[1].replace(/\s+#.*$/, ""); // a trailing comment may say anything
      assert.ok(!/: /.test(value) && !value.endsWith(":"), `${file}:${i + 1} needs quotes: ${line.trim()}`);
    });
  }
});
