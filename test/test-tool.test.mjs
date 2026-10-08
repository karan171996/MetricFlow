// C1.5: a tool that declares only `errors` gets a sidebar tab, a setup group and an Errors column
// from its registry entry alone. No component is imported or edited: they all read what is asserted here.
// Own file, because it adds to the registry before lib/env.ts is loaded (node runs each test file in its own process).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { load, mockAxios, req, root, tmpEnvFile } from "./helpers.mjs";

mockAxios(() => { throw new Error("no network in this test"); });

const tools = await load("lib/tools.ts");
tools.TOOLS["test-tool"] = {
  label: "Test Tool",
  icon: () => null,
  description: "FAKE tool for the registry test.",
  connectReason: "Add your Test Tool key.",
  keys: { required: ["TEST_TOOL_KEY"], optional: [] },
  capabilities: ["errors"],
  stats: () => [],
  // The second column needs a capability this tool does not declare, so it must not be shown.
  columns: [{ needs: "errors", header: "Errors", cell: (p) => String(p.metrics.errors?.count ?? 0) }, { needs: "loadTime", header: "Load", cell: () => "" }],
};
tools.TOOL_IDS.push("test-tool");
tools.KEY_FIELDS.TEST_TOOL_KEY = { label: "Test Tool key", secret: true, help: "FAKE" };

const env = await load("lib/env.ts");
const setup = await load("app/api/setup/route.ts");

test("C1.5: a registry entry with only `errors` is enough for the tab, the setup group and the Errors column", async () => {
  for (const k of env.SETUP_KEYS) delete process.env[k];
  process.env.METRICFLOW_ENV_FILE = tmpEnvFile();
  assert.ok(tools.isToolId("test-tool"));
  assert.ok(env.SETUP_KEYS.includes("TEST_TOOL_KEY"), "setup group: its key is a setup key");

  // Setup group: the form lists TOOL_IDS and, per tool, KEY_FIELDS of its required keys.
  const fields = tools.TOOL_IDS.flatMap((id) => tools.TOOLS[id].keys.required.map((name) => ({ id, ...tools.KEY_FIELDS[name] })));
  assert.deepEqual(fields.filter((f) => f.id === "test-tool").map((f) => f.label), ["Test Tool key"]);

  // Saving its key goes through the same route and the same writer.
  const res = await setup.POST(req("http://localhost:3000/api/setup", { method: "POST", body: { TEST_TOOL_KEY: "FAKE-test-key" } }));
  assert.equal(res.status, 200);
  assert.equal(readFileSync(process.env.METRICFLOW_ENV_FILE, "utf8"), "TEST_TOOL_KEY=FAKE-test-key\n");

  // Sidebar tab: the sidebar lists the `tools` of GET /api/setup, with label and icon from TOOLS.
  const status = await (await setup.GET(req("http://localhost:3000/api/setup"))).json();
  assert.deepEqual(status.tools, ["test-tool"]);
  assert.equal(status.keys.TEST_TOOL_KEY, true);

  // Errors column: it supplies `errors` (Sentry is not connected), and its tab shows only the columns it declares.
  assert.deepEqual(tools.sourcesFor(env.connectedTools()), { errors: "test-tool" });
  assert.deepEqual(tools.toolColumns("test-tool").map((c) => c.header), ["Errors"]);
  assert.equal(tools.sourcesFor(["sentry", "test-tool"]).errors, "sentry", "Sentry is earlier in TOOLS, so it stays the supplier");
});

// C1.2: no screen reads a vendor field from a page or compares a tool id. components/Connect is exempt until C2 rewrites it.
test("C1.2: nothing under components/ or app/ (outside app/api) names a vendor field or a tool id", async () => {
  const { globSync } = await import("node:fs");
  const files = globSync(["components/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"], { cwd: root }).filter((f) => !/^app\/api\/|^components\/Connect\//.test(f));
  assert.ok(files.length > 40, "the glob found the source files");
  const vendor = /\bnewRelic\b|\bsentry\??\.|\.sentry\b|["'`](new-relic|sentry)["'`]/;
  const hits = files.flatMap((f) => readFileSync(`${root}/${f}`, "utf8").split("\n").flatMap((line, i) => (vendor.test(line) ? [`${f}:${i + 1}: ${line.trim()}`] : [])));
  assert.deepEqual(hits, []);
});
