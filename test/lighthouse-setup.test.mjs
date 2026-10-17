// POST/GET /api/setup with LIGHTHOUSE_REPORT.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FAKE, load, mockAxios, req, tmpEnvFile } from "./helpers.mjs";

const calls = mockAxios(() => { throw new Error("no network in this test"); });
const { GET, POST } = await load("app/api/setup/route.ts");
const { LOAD_ERRORS, NO_DATA } = await load("lib/analytics/LighthouseAnalytics.ts");

const dir = mkdtempSync(join(tmpdir(), "lh-setup-"));
process.env.METRICFLOW_PROJECT_DIR = dir;
const lhr = { finalUrl: "https://prod.example/", fetchTime: "2026-01-01T00:00:00Z", categories: { performance: { score: 0.8 } }, audits: {} };
writeFileSync(join(dir, "report.json"), JSON.stringify(lhr));
writeFileSync(join(dir, "other.json"), '{"password":"TOPSECRET-FILE-CONTENT"}');
writeFileSync(join(dir, "broken.json"), "{ TOPSECRET-FILE-CONTENT");
writeFileSync(join(dir, "notes-secret.txt"), "TOPSECRET-FILE-CONTENT");
writeFileSync(join(dir, "big-secret.json"), JSON.stringify({ x: "a".repeat(5 * 1024 * 1024) }));

let envFile;
beforeEach(() => {
  calls.length = 0;
  envFile = tmpEnvFile();
  process.env.METRICFLOW_ENV_FILE = envFile;
  for (const k of [...Object.keys(FAKE), "LIGHTHOUSE_REPORT"]) delete process.env[k];
});
const post = (body) => POST(req("http://localhost:3000/api/setup", { method: "POST", body }));

test("a valid report path is saved, live without restart, and connects Lighthouse alone", async () => {
  const res = await post({ LIGHTHOUSE_REPORT: "report.json" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { saved: true, results: { LIGHTHOUSE_REPORT: { ok: true } } });
  assert.match(readFileSync(envFile, "utf8"), /^LIGHTHOUSE_REPORT=report\.json$/m);
  assert.equal(process.env.LIGHTHOUSE_REPORT, "report.json");
  const status = await (await GET(req("http://localhost:3000/api/setup"))).json();
  assert.deepEqual(status.tools, ["lighthouse"]);
  assert.equal(status.configured, true);
  assert.equal(calls.length, 0);
});

test("UNSAFE values get 400 under the field, nothing written, spec not echoed", async () => {
  for (const bad of ["my report.json", "a#b.json", 'a"b.json', "a'b.json", "a`b.json", "a$b.json", "a\\b.json", "a\nEVIL=1", "a\0b.json"]) {
    const res = await post({ LIGHTHOUSE_REPORT: bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
    const body = await res.json();
    assert.equal(body.results.LIGHTHOUSE_REPORT.ok, false);
    assert.ok(!JSON.stringify(body).includes("EVIL") && !JSON.stringify(body).includes("my report"));
  }
  assert.ok(!existsSync(envFile));
  assert.equal(process.env.LIGHTHOUSE_REPORT, undefined);
});

test("unusable specs are refused 422 with fixed text and never echo the spec or any file content", async () => {
  const specs = ["other.json", "broken.json", "nosuch-secret-name.json", "../../etc/passwd", "http://127.0.0.1/leak-path.json", "http://169.254.169.254/latest/meta-data", "file:///etc/passwd", "C2:x"];
  for (const spec of specs) {
    const res = await post({ LIGHTHOUSE_REPORT: spec });
    assert.equal(res.status, 422, spec);
    const s = JSON.stringify(await res.json());
    assert.match(s, /Lighthouse report/);
    for (const leak of ["TOPSECRET", "nosuch-secret-name", "leak-path", "127.0.0.1", "169.254", "passwd", "ENOENT", "Unexpected", "position", "token"]) assert.ok(!s.includes(leak), `${spec} leaked ${leak}: ${s}`);
  }
  assert.ok(!existsSync(envFile));
  assert.equal(process.env.LIGHTHOUSE_REPORT, undefined);
});

test("a blank or whitespace value counts as untouched", async () => {
  for (const v of ["", "   "]) {
    const res = await post({ LIGHTHOUSE_REPORT: v });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "Fill in every field for at least one tool.");
  }
});

test("GET exposes LIGHTHOUSE_REPORT as a boolean only", async () => {
  let body = await (await GET(req("http://localhost:3000/api/setup"))).json();
  assert.strictEqual(body.keys.LIGHTHOUSE_REPORT, false);
  process.env.LIGHTHOUSE_REPORT = "report-SECRETPATH.json";
  body = await (await GET(req("http://localhost:3000/api/setup"))).json();
  assert.strictEqual(body.keys.LIGHTHOUSE_REPORT, true);
  assert.ok(!JSON.stringify(body).includes("SECRETPATH"));
});

test("saved alongside the other tools in one request", async () => {
  const res = await post({ LIGHTHOUSE_REPORT: "report.json", NEWRELIC_API_KEY: "FAKE-NRAK-0000" });
  // New Relic's group is half filled, so nothing is saved, Lighthouse included
  assert.equal(res.status, 400);
  assert.ok(!existsSync(envFile));
});

test("each failure names its cause in fixed text, never the spec or file content", async () => {
  const cases = [
    ["http://127.0.0.1/leak-path.json", LOAD_ERRORS.blocked],
    ["http://example.com:8080/leak-path.json", LOAD_ERRORS.blocked],
    ["file:///etc/passwd", LOAD_ERRORS.blocked],
    ["nosuch-secret-name.json", LOAD_ERRORS.notFound],
    ["nosuch-secret-dir/", LOAD_ERRORS.notFound],
    ["notes-secret.txt", LOAD_ERRORS.notJsonFile],
    ["big-secret.json", LOAD_ERRORS.tooLarge],
    ["broken.json", LOAD_ERRORS.notJson],
    ["other.json", NO_DATA],
  ];
  for (const [spec, message] of cases) {
    const res = await post({ LIGHTHOUSE_REPORT: spec });
    assert.equal(res.status, 422, spec);
    const body = await res.json();
    assert.equal(body.results.LIGHTHOUSE_REPORT.error, message, spec);
    const s = JSON.stringify(body);
    for (const leak of [spec, "secret", "TOPSECRET", "leak-path", "127.0.0.1", "8080", "passwd"]) assert.ok(!s.includes(leak), `${spec} leaked ${leak}: ${s}`);
  }
  // the fixed texts themselves are distinct and name the Lighthouse report
  const texts = [...Object.values(LOAD_ERRORS), NO_DATA];
  assert.equal(new Set(texts).size, texts.length);
  for (const t of texts) assert.match(t, /Lighthouse report/);
  assert.ok(!existsSync(envFile));
});
