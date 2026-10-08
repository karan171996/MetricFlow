import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { FAKE, load, mockAxios, req, tmpEnvFile } from "./helpers.mjs";

mockAxios((m, u) => (u.includes("newrelic") ? { data: { data: { actor: { user: { id: 1 }, account: { id: 1234567 } } } } } : { data: [{ id: "123", slug: "from-token" }] }));

const { writeEnvLocal, AI_PROVIDERS, AI_PROVIDER_KEY } = await load("lib/env.ts");
const { TOOLS } = await load("lib/tools.ts");
const setup = await load("app/api/setup/route.ts");

let f;
beforeEach(() => {
  f = tmpEnvFile();
  process.env.METRICFLOW_ENV_FILE = f;
  for (const k of [...Object.keys(FAKE), "NEWRELIC_REGION", "PATH_TO_EVIL"]) delete process.env[k];
});

test("writeEnvLocal: a name no tool declares throws, and the file and process.env are untouched", () => {
  assert.throws(() => writeEnvLocal({ SENTRY_DSN: "ok", PATH_TO_EVIL: "x" }, f), /no tool declares/);
  assert.ok(!existsSync(f));
  assert.equal(process.env.SENTRY_DSN, undefined);
  assert.equal(process.env.PATH_TO_EVIL, undefined);

  writeFileSync(f, "KEEP=1\n");
  assert.throws(() => writeEnvLocal({ NODE_OPTIONS: "--require=/tmp/x" }, f));
  assert.equal(readFileSync(f, "utf8"), "KEEP=1\n");
});

test("writeEnvLocal: a value with an unsafe character throws without echoing it, nothing written", () => {
  for (const bad of ["a b", "a\nINJECTED=1", "a#b", 'a"b', "a'b", "a`b", "a\\b", "a$b", "a\0b"]) {
    assert.throws(() => writeEnvLocal({ SENTRY_DSN: bad }, f), (e) => /unsafe/.test(e.message) && !e.message.includes(bad));
  }
  assert.ok(!existsSync(f));
});

test("writeEnvLocal: every declared tool key (required, optional, derived) and AI key is accepted", () => {
  const names = [
    ...Object.values(TOOLS).flatMap((t) => [...t.keys.required, ...t.keys.optional, ...(t.keys.derived ?? [])]),
    ...Object.values(AI_PROVIDERS).map((p) => p.key),
    AI_PROVIDER_KEY,
  ];
  assert.ok(names.includes("NEWRELIC_INSERT_KEY") && names.includes("NEWRELIC_REGION"), "both come from New Relic's entry");
  const saved = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  try {
    writeEnvLocal(Object.fromEntries(names.map((n) => [n, "FAKE-v"])), f);
    assert.deepEqual(readFileSync(f, "utf8").trim().split("\n"), names.map((n) => `${n}=FAKE-v`));
  } finally {
    for (const n of names) if (saved[n] === undefined) delete process.env[n]; else process.env[n] = saved[n];
  }
});

test("POST /api/setup: an undeclared name in the body is ignored, the declared keys are saved", async () => {
  const body = { SENTRY_API_KEY: FAKE.SENTRY_API_KEY, SENTRY_DSN: FAKE.SENTRY_DSN, PATH_TO_EVIL: "x", NEWRELIC_REGION: "eu" };
  const res = await setup.POST(req("http://localhost:3000/api/setup", { method: "POST", body }));
  assert.equal(res.status, 200);
  assert.deepEqual(readFileSync(f, "utf8").trim().split("\n").map((l) => l.split("=")[0]), ["SENTRY_API_KEY", "SENTRY_DSN"]);
  assert.equal(process.env.PATH_TO_EVIL, undefined);
  assert.equal(process.env.NEWRELIC_REGION, undefined, "a derived key is never taken from the body");
});
