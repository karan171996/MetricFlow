// C2a: a third tool with a server half goes through POST /api/setup with no route edit.
// Own file: it adds to the registries before lib/env.ts is loaded (node runs each test file in its own process).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { load, mockAxios, req, tmpEnvFile } from "./helpers.mjs";

mockAxios(() => { throw new Error("no network in this test"); });

const tools = await load("lib/tools.ts");
tools.TOOLS["test-tool"] = {
  label: "Test Tool", icon: () => null, description: "FAKE", connectReason: "FAKE",
  keys: { required: ["TEST_TOOL_KEY"], optional: [], derived: ["TEST_TOOL_MODE"] },
  capabilities: ["errors"], stats: () => [], columns: [],
};
tools.TOOL_IDS.push("test-tool");
tools.KEY_FIELDS.TEST_TOOL_KEY = { label: "Test Tool key", secret: true, help: "FAKE" };

const { SERVER_TOOLS } = await load("lib/analytics/index.ts");
const seen = [];
SERVER_TOOLS["test-tool"] = {
  update: async (values) => {
    seen.push(values);
    return values.TEST_TOOL_KEY === "FAKE-bad"
      ? { results: { TEST_TOOL_KEY: { ok: false, error: "Test Tool rejected the key." } } }
      : { results: { TEST_TOOL_KEY: { ok: true } }, derived: { TEST_TOOL_MODE: "fast", PATH: "/evil" } };
  },
};
const setup = await load("app/api/setup/route.ts");
const post = (body) => setup.POST(req("http://localhost:3000/api/setup", { method: "POST", body }));

test("a third tool's update() runs from POST /api/setup; only its declared derived names are saved", async () => {
  process.env.METRICFLOW_ENV_FILE = tmpEnvFile();
  const res = await post({ TEST_TOOL_KEY: "FAKE-ok" });
  assert.equal(res.status, 200);
  assert.deepEqual(seen, [{ TEST_TOOL_KEY: "FAKE-ok" }]);
  assert.equal(readFileSync(process.env.METRICFLOW_ENV_FILE, "utf8"), "TEST_TOOL_KEY=FAKE-ok\nTEST_TOOL_MODE=fast\n");
  assert.notEqual(process.env.PATH, "/evil");
});

test("a third tool's rejection stops the save: 422 under its field, nothing written", async () => {
  process.env.METRICFLOW_ENV_FILE = tmpEnvFile();
  const res = await post({ TEST_TOOL_KEY: "FAKE-bad" });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).results.TEST_TOOL_KEY.error, "Test Tool rejected the key.");
  assert.throws(() => readFileSync(process.env.METRICFLOW_ENV_FILE));
});
