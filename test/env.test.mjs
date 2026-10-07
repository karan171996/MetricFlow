import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FAKE, load, tmpEnvFile } from "./helpers.mjs";

const { writeEnvLocal, envFilePath, projectDir, isConfigured, isToolConnected, connectedTools, SETUP_KEYS } = await load("lib/env.ts");
const { TOOLS, TOOL_IDS } = await load("lib/tools.ts");

test("METRICFLOW_ENV_FILE overrides the target path", () => {
  process.env.METRICFLOW_ENV_FILE = "/tmp/x/.env.fake";
  assert.equal(envFilePath(), "/tmp/x/.env.fake");
  delete process.env.METRICFLOW_ENV_FILE;
  assert.equal(envFilePath(), join(process.cwd(), ".env.local"));
});

test("writes go to the folder the CLI was run in, not the installed package", () => {
  // The server's cwd is the package dir, so without this the keys land in node_modules.
  process.env.METRICFLOW_PROJECT_DIR = "/tmp/user-project";
  assert.equal(projectDir(), "/tmp/user-project");
  assert.equal(envFilePath(), "/tmp/user-project/.env.local");
  delete process.env.METRICFLOW_PROJECT_DIR;
  assert.equal(envFilePath(), join(process.cwd(), ".env.local"));
});

test("cli hands the server its invocation cwd", () => {
  const cli = readFileSync(join(import.meta.dirname, "../bin/cli.mjs"), "utf8");
  assert.match(cli, /METRICFLOW_PROJECT_DIR:\s*process\.cwd\(\)/);
});

test("writeEnvLocal creates the file with mode 0600, no temp file left, process.env updated", () => {
  const f = tmpEnvFile();
  writeEnvLocal({ SENTRY_DSN: "https://public@o1.ingest.sentry.io/2" }, f);
  assert.equal(readFileSync(f, "utf8"), "SENTRY_DSN=https://public@o1.ingest.sentry.io/2\n");
  assert.equal(statSync(f).mode & 0o777, 0o600);
  assert.ok(!existsSync(`${f}.tmp`));
  assert.equal(process.env.SENTRY_DSN, "https://public@o1.ingest.sentry.io/2");
});

test("writeEnvLocal keeps unrelated lines and comments, replaces in place, appends new", () => {
  const f = tmpEnvFile();
  writeFileSync(f, "# my comment\nOTHER=keep me\nSENTRY_DSN=old\nGEMINI_API_KEY=FAKE-GEMINI\n");
  writeEnvLocal({ SENTRY_DSN: "new", SENTRY_API_KEY: "p" }, f);
  assert.equal(readFileSync(f, "utf8"), "# my comment\nOTHER=keep me\nSENTRY_DSN=new\nGEMINI_API_KEY=FAKE-GEMINI\nSENTRY_API_KEY=p\n");
});

test("writeEnvLocal throws when the folder is not writable (callers report it)", () => {
  assert.throws(() => writeEnvLocal({ SENTRY_DSN: "x" }, "/nonexistent-dir-fake/.env.local"));
});

test("isConfigured is true when ONE tool's keys are all set; half a tool is not connected", () => {
  for (const k of SETUP_KEYS) delete process.env[k];
  assert.equal(isConfigured(), false);
  assert.deepEqual(connectedTools(), []);
  for (const id of TOOL_IDS) {
    const [first, ...rest] = TOOLS[id].keys.required;
    process.env[first] = FAKE[first] ?? "FAKE-x";
    assert.equal(isToolConnected(id), rest.length === 0, `${id}: half set`);
    for (const k of rest) process.env[k] = FAKE[k] ?? "FAKE-x";
    assert.equal(isToolConnected(id), true, `${id}: all set`);
    assert.equal(isConfigured(), true);
    assert.deepEqual(connectedTools(), [id]);
    for (const k of TOOLS[id].keys.required) delete process.env[k];
    assert.equal(isConfigured(), false);
  }
  Object.assign(process.env, FAKE);
  assert.deepEqual(connectedTools(), TOOL_IDS);
  for (const k of SETUP_KEYS) delete process.env[k];
});
