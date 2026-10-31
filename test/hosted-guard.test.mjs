// The mode switch: with METRICFLOW_MODE=hosted every key write, disk write and process-wide store is off.
// Unset, nothing changes (the other suites run with it unset). Stores and fs are spied; no network.
import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs, { existsSync, readdirSync, readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { FAKE, load, mockAxios, req, root, tmpEnvFile } from "./helpers.mjs";

const axiosCalls = mockAxios(() => { throw new Error("no network in this test"); });

// Each store is replaced by a recorder: any function call or object read lands in `touched`.
const touched = [];
const STORES = ["lib/metricsHistory.ts", "lib/apiTimingStore.ts", "lib/lighthouseRun.ts", "lib/analytics/index.ts"];
const record = (where) => (value) => {
  if (typeof value === "function") return (...a) => { touched.push(where); return value(...a); };
  if (value && typeof value === "object") return new Proxy(value, { get: (t, k) => (touched.push(`${where}.${String(k)}`), Reflect.get(t, k)) });
  return value;
};
for (const rel of STORES) {
  const real = await load(rel);
  const namedExports = Object.fromEntries(Object.entries(real).map(([k, v]) => [k, record(`${rel}:${k}`)(v)]));
  mock.module(pathToFileURL(join(root, rel)).href, { namedExports });
}

// fs writes: the builtin's named exports are re-synced so `import { writeFileSync }` sees the spy too.
const WRITES = ["writeFileSync", "renameSync", "appendFileSync", "mkdirSync", "rmSync", "unlinkSync", "copyFileSync", "writeFile", "rename", "appendFile"];
const spies = WRITES.map((n) => mock.method(fs, n));
const pSpies = ["writeFile", "rename", "appendFile", "mkdir", "rm", "unlink"].map((n) => mock.method(fs.promises, n));
syncBuiltinESMExports();
const fsWrites = () => [...spies, ...pSpies].reduce((n, s) => n + s.mock.callCount(), 0);
const resetSpies = () => { for (const s of [...spies, ...pSpies]) s.mock.resetCalls(); touched.length = 0; axiosCalls.length = 0; };

const { isHosted, writeEnvLocal, EnvWriteRefused, SETUP_KEYS } = await load("lib/env.ts");
const { DEFAULT_THRESHOLDS } = await load("lib/thresholds.ts");

const modeOn = async (fn) => { process.env.METRICFLOW_MODE = "hosted"; try { return await fn(); } finally { delete process.env.METRICFLOW_MODE; } };
afterEach(() => { delete process.env.METRICFLOW_MODE; });

test("isHosted is true only for the exact value 'hosted'", () => {
  delete process.env.METRICFLOW_MODE;
  assert.equal(isHosted(), false, "unset");
  for (const v of ["", "local", "HOSTED", "Hosted", " hosted", "hosted ", "1", "true"]) {
    process.env.METRICFLOW_MODE = v;
    assert.equal(isHosted(), false, JSON.stringify(v));
  }
  process.env.METRICFLOW_MODE = "hosted";
  assert.equal(isHosted(), true);
});

test("METRICFLOW_MODE=hosted: writeEnvLocal throws EnvWriteRefused before any fs write, and process.env is untouched", async () => {
  const path = tmpEnvFile();
  const before = JSON.stringify(process.env);
  resetSpies();
  await modeOn(() => assert.throws(() => writeEnvLocal({ NEWRELIC_API_KEY: FAKE.NEWRELIC_API_KEY }, path), (e) => e instanceof EnvWriteRefused && !/NEWRELIC|FAKE/.test(e.message)));
  assert.equal(fsWrites(), 0);
  assert.equal(existsSync(path), false);
  assert.equal(JSON.stringify(process.env), before);
});

test("control: unset, writeEnvLocal writes as before (the spies see it)", () => {
  const path = tmpEnvFile();
  resetSpies();
  writeEnvLocal({ NEWRELIC_REGION: "us" }, path);
  assert.equal(readFileSync(path, "utf8"), "NEWRELIC_REGION=us\n");
  assert.ok(spies.find((s) => s.mock.callCount()), "the fs spy did not see the write");
  delete process.env.NEWRELIC_REGION;
});

// Every route handler, discovered from app/ so a new route without a guard fails here. Only in the hosted build
// (lib/hosted present, never in this repo) a route that imports @/lib/hosted/ is left to the hosted build's own tests.
const hostedBuild = existsSync(join(root, "lib/hosted"));
const routes = readdirSync(join(root, "app"), { recursive: true })
  .filter((f) => /(^|\/)route\.(ts|tsx|js|mjs)$/.test(f))
  .filter((f) => !(hostedBuild && readFileSync(join(root, "app", f), "utf8").includes("@/lib/hosted/")))
  .map((f) => ({ file: `app/${f}`, path: "/" + f.replace(/\/?route\.(ts|tsx|js|mjs)$/, "") }));

const REFUSED = { status: 403, body: { error: "Not available in this mode." } };
// What each handler answers when METRICFLOW_MODE=hosted. `body` as a function checks a body that carries a timestamp.
const EXPECTED = {
  "GET /api/setup": REFUSED, "POST /api/setup": REFUSED,
  "GET /api/setup/ai": REFUSED, "POST /api/setup/ai": REFUSED,
  "GET /api/connect": REFUSED, "POST /api/connect": REFUSED,
  "PUT /api/settings": REFUSED,
  "GET /api/settings": { status: 200, body: DEFAULT_THRESHOLDS },
  "GET /api/lighthouse": REFUSED, "POST /api/lighthouse": REFUSED,
  "POST /api/analyze": REFUSED,
  "GET /api/timings": { status: 200, body: { items: [] } },
  "GET /api/metrics": { status: 200, body: (b) => { assert.deepEqual({ ...b, timestamp: 0, sources: 0 }, { configured: false, tools: [], project: "", pages: [], history: [], timestamp: 0, sources: 0 }); } },
  "GET /api/health": { status: 200, body: (b) => assert.equal(b.status, "ok") },
};

// Everything a handler could act on: every tool's keys, a Lighthouse target, an AI key, metrics to analyze.
const BODY = { ...FAKE, LIGHTHOUSE_TARGET: "http://localhost:3001", NEWRELIC_INSERT_KEY: "FAKE-INSERT-0000", provider: "claude", key: "FAKE-CLAUDE-0000", metrics: [], loadSeconds: 2 };
const KEYS_SET = { ...FAKE, LIGHTHOUSE_TARGET: "http://localhost:3001", NEWRELIC_INSERT_KEY: "FAKE-INSERT-0000", CLAUDE_API_KEY: "FAKE-CLAUDE-0000" };

test("route discovery found every route the table names, and the table names every route", async () => {
  const found = [];
  for (const r of routes) for (const m of Object.keys(await load(r.file)).filter((k) => /^[A-Z]+$/.test(k))) found.push(`${m} ${r.path}`);
  assert.deepEqual(found.sort(), Object.keys(EXPECTED).sort());
});

test("METRICFLOW_MODE=hosted: every handler answers its fixed response with zero store calls, fs writes, network calls or process.env changes", async () => {
  const saved = { ...process.env };
  Object.assign(process.env, KEYS_SET, { METRICFLOW_ENV_FILE: tmpEnvFile(), METRICFLOW_SETTINGS_FILE: tmpEnvFile() + ".settings.json" });
  try {
    for (const r of routes) {
      const mod = await load(r.file);
      for (const m of Object.keys(mod).filter((k) => /^[A-Z]+$/.test(k))) {
        const name = `${m} ${r.path}`;
        resetSpies();
        const before = JSON.stringify(process.env);
        const res = await modeOn(() => mod[m](req(`http://localhost:3000${r.path}`, { method: m, body: m === "GET" ? undefined : BODY })));
        const text = await res.text();
        const want = EXPECTED[name];
        assert.equal(res.status, want.status, name);
        if (typeof want.body === "function") want.body(JSON.parse(text)); else assert.deepEqual(JSON.parse(text), want.body, name);
        assert.ok(![...SETUP_KEYS, ...Object.values(KEYS_SET)].some((k) => text.includes(k)), `${name} echoes a key name or value`);
        assert.deepEqual(touched, [], `${name} touched a store`);
        assert.equal(fsWrites(), 0, `${name} wrote to disk`);
        assert.equal(axiosCalls.length, 0, `${name} made a network call`);
        assert.equal(JSON.stringify(process.env), before, `${name} changed process.env`);
      }
    }
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

test("control: unset, the same handlers do reach the stores and the disk (the spies are live)", async () => {
  const settingsFile = tmpEnvFile() + ".settings.json";
  process.env.METRICFLOW_SETTINGS_FILE = settingsFile;
  try {
    resetSpies();
    await (await load("app/api/timings/route.ts")).GET();
    assert.ok(touched.some((t) => t.startsWith("lib/apiTimingStore.ts")), "timings did not reach its store");
    resetSpies();
    const res = await (await load("app/api/settings/route.ts")).PUT(req("http://localhost:3000/api/settings", { method: "PUT", body: { loadSeconds: 2 } }));
    assert.equal(res.status, 200);
    assert.ok(fsWrites() > 0, "settings PUT did not write");
  } finally { delete process.env.METRICFLOW_SETTINGS_FILE; }
});

test("isLocalRequest refuses a localhost request when METRICFLOW_MODE=hosted", async () => {
  const { isLocalRequest } = await load("lib/localRequest.ts");
  const r = () => req("http://localhost:3000/api/setup");
  assert.equal(isLocalRequest(r()), true);
  await modeOn(() => assert.equal(isLocalRequest(r()), false));
});

test("the CLI empties METRICFLOW_MODE for the server, after the inherited shell env", () => {
  const cli = readFileSync(join(root, "bin/cli.mjs"), "utf8");
  const envBlock = cli.slice(cli.indexOf("...process.env,"), cli.indexOf("},\n});"));
  assert.match(envBlock, /^\s*METRICFLOW_MODE: "",$/m, 'METRICFLOW_MODE: "" must follow ...process.env so a shell value is overridden');
});
