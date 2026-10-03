// .githooks/check-markdown.mjs: the pre-commit check that staged Markdown renders fully.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { problems } from "../.githooks/check-markdown.mjs";
import { root } from "./helpers.mjs";

test("the real README passes", () => {
  assert.deepEqual(problems(readFileSync(join(root, "README.md"), "utf8")), []);
});

test("unclosed code fence is caught", () => {
  assert.match(problems("# A\n```bash\nnpm i\n## B\n").join(), /line 2: code fence is never closed/);
});

test("unclosed HTML comment is caught; a closed one passes", () => {
  assert.match(problems("a\n<!-- todo\nb\n").join(), /line 2: <!-- comment is never closed/);
  assert.deepEqual(problems("a <!-- x --> b\n<!--\ny\n-->\n"), []);
});

test("table row with the wrong cell count is caught; pipes in code or escaped don't count", () => {
  assert.match(problems("| a | b |\n| --- | --- |\n| 1 |\n").join(), /line 3: table row has 1 cells, header has 2/);
  assert.deepEqual(problems("| a | b |\n| --- | --- |\n| `x|y` | 1 \\| 2 |\n"), []);
});

test("missing local link target is caught; URLs and anchors are skipped", () => {
  const found = problems("[x](docs/nope.png) [y](https://a.b) [z](#top) ![w](ok.png)", (p) => p === "ok.png");
  assert.deepEqual(found, ["line 1: link or image points to a missing file: docs/nope.png"]);
});
