import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { httpError, load, mockAxios, req, tmpEnvFile } from "./helpers.mjs";

let handler = () => ({ data: {} });
const calls = mockAxios((m, u, c) => handler(m, u, c));
const { GET, POST } = await load("app/api/setup/ai/route.ts");
const { activeAi } = await load("lib/env.ts");

const KEYS = ["AI_PROVIDER", "GEMINI_API_KEY", "CLAUDE_API_KEY", "OPENAI_API_KEY"];
let envFile;
beforeEach(() => {
  calls.length = 0;
  handler = () => ({ data: {} });
  envFile = tmpEnvFile();
  process.env.METRICFLOW_ENV_FILE = envFile;
  for (const k of KEYS) delete process.env[k];
});
const post = (body, headers) => POST(req("http://localhost:3000/api/setup/ai", { method: "POST", body, headers }));

test("non-localhost requests are refused, nothing written, no external call", async () => {
  assert.equal((await post({ provider: "claude", key: "FAKE-CLAUDE" }, { host: "evil.example" })).status, 403);
  assert.equal((await GET(req("http://x/api/setup/ai", { headers: { host: "evil.example" } }))).status, 403);
  assert.ok(!existsSync(envFile));
  assert.equal(calls.length, 0);
});

test("bad provider, empty key and special characters are rejected before any call", async () => {
  assert.equal((await post({ provider: "nope", key: "FAKE" })).status, 400);
  assert.equal((await post({ provider: "claude", key: "  " })).status, 400);
  assert.equal((await post({ provider: "claude", key: "a\nEVIL=1" })).status, 400);
  assert.equal(calls.length, 0);
  assert.ok(!existsSync(envFile));
});

test("valid key is checked once, saved, and becomes the active provider", async () => {
  const res = await post({ provider: "claude", key: "FAKE-CLAUDE-0000" });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes("anthropic"));
  const file = readFileSync(envFile, "utf8");
  assert.match(file, /AI_PROVIDER=claude/);
  assert.match(file, /CLAUDE_API_KEY=FAKE-CLAUDE-0000/);
  assert.deepEqual(activeAi(), { provider: "claude", key: "FAKE-CLAUDE-0000" });

  const status = await (await GET(req("http://localhost:3000/api/setup/ai"))).text();
  assert.ok(!status.includes("FAKE-CLAUDE-0000"), "key value must never be returned");
  assert.deepEqual(JSON.parse(status), { provider: "claude", keys: { gemini: false, claude: true, openai: false } });
});

test("rejected key: 422, nothing saved, key not echoed", async () => {
  handler = () => {
    throw httpError(401);
  };
  const res = await post({ provider: "openai", key: "FAKE-OPENAI-0000" });
  assert.equal(res.status, 422);
  assert.ok(!(await res.text()).includes("FAKE-OPENAI-0000"));
  assert.ok(!existsSync(envFile));
});

test("activeAi falls back to whichever key is set when AI_PROVIDER is unset", () => {
  assert.equal(activeAi(), null);
  process.env.GEMINI_API_KEY = "FAKE-GEMINI";
  assert.deepEqual(activeAi(), { provider: "gemini", key: "FAKE-GEMINI" });
});
