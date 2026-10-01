import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FAKE, load, tmpEnvFile } from "./helpers.mjs";

const { writeEnvLocal, envFilePath, isConfigured, SETUP_KEYS } = await load("lib/env.ts");

test("METRICFLOW_ENV_FILE overrides the target path", () => {
  process.env.METRICFLOW_ENV_FILE = "/tmp/x/.env.fake";
  assert.equal(envFilePath(), "/tmp/x/.env.fake");
  delete process.env.METRICFLOW_ENV_FILE;
  assert.equal(envFilePath(), join(process.cwd(), ".env.local"));
});

test("writeEnvLocal creates the file with mode 0600, no temp file left, process.env updated", () => {
  const f = tmpEnvFile();
  writeEnvLocal({ SENTRY_ORG_SLUG: "fake-org" }, f);
  assert.equal(readFileSync(f, "utf8"), "SENTRY_ORG_SLUG=fake-org\n");
  assert.equal(statSync(f).mode & 0o777, 0o600);
  assert.ok(!existsSync(`${f}.tmp`));
  assert.equal(process.env.SENTRY_ORG_SLUG, "fake-org");
});

test("writeEnvLocal keeps unrelated lines and comments, replaces in place, appends new", () => {
  const f = tmpEnvFile();
  writeFileSync(f, "# my comment\nOTHER=keep me\nSENTRY_ORG_SLUG=old\nGEMINI_API_KEY=FAKE-GEMINI\n");
  writeEnvLocal({ SENTRY_ORG_SLUG: "new", SENTRY_PROJECT_ID: "p" }, f);
  assert.equal(readFileSync(f, "utf8"), "# my comment\nOTHER=keep me\nSENTRY_ORG_SLUG=new\nGEMINI_API_KEY=FAKE-GEMINI\nSENTRY_PROJECT_ID=p\n");
});

test("writeEnvLocal throws when the folder is not writable (callers report it)", () => {
  assert.throws(() => writeEnvLocal({ SENTRY_ORG_SLUG: "x" }, "/nonexistent-dir-fake/.env.local"));
});

test("isConfigured needs all five setup keys", () => {
  for (const k of SETUP_KEYS) delete process.env[k];
  assert.equal(isConfigured(), false);
  Object.assign(process.env, FAKE);
  assert.equal(isConfigured(), true);
  delete process.env.SENTRY_PROJECT_ID;
  assert.equal(isConfigured(), false);
  for (const k of SETUP_KEYS) delete process.env[k];
});
