// Lighthouse report parsing and the guarded loader (no network: the DNS lookup is injected, servers are on 127.0.0.1 only for the allowed-address case).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load } from "./helpers.mjs";

const { parseLighthouse } = await load("lib/lighthouse.ts");
const { loadReports, isBlockedAddress, fetchJson } = await load("lib/lighthouseSource.ts");

const lhr = (url, score, extra = {}, t = "2026-01-01T00:00:00Z") => ({
  finalUrl: url, fetchTime: t, categories: { performance: { score } },
  audits: { "largest-contentful-paint": { numericValue: score * 1000 }, "cumulative-layout-shift": { numericValue: 0.1 }, "total-blocking-time": { numericValue: 50 } }, ...extra
});

test("parse: one run, rounding, absent audit stays absent", () => {
  const r = lhr("https://prod.example/a?x=1", 0.876);
  delete r.audits["total-blocking-time"];
  assert.deepEqual(parseLighthouse(r), { "/a": { lighthouse: { score: 88, lcp: 876, cls: 0.1 } } });
});

test("parse: skips manifest, runtimeError, null score; lower median whole run", () => {
  const out = parseLighthouse([[], { url: "x" }, lhr("http://h/a", null), lhr("http://h/a", 0.5, { runtimeError: { code: "X" } }),
    lhr("http://h/a", 0.9), lhr("http://h/a?q", 0.5), lhr("http://h/a", 0.7), lhr("http://h/a", 0.6)]);
  assert.equal(out["/a"].lighthouse.score, 60); // sorted 50,60,70,90 -> index 1
  assert.equal(out["/a"].lighthouse.lcp, 600);
});

test("blocklist covers private, mapped and literal addresses", () => {
  for (const a of ["127.0.0.1", "10.1.1.1", "169.254.169.254", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "100.64.0.1", "not-an-ip"]) assert.ok(isBlockedAddress(a), a);
  for (const a of ["93.184.216.34", "2606:4700::1111", "::ffff:5db8:d822"]) assert.ok(!isBlockedAddress(a), a);
});

test("url: refuses bad schemes, userinfo, ports, literal private IPs, and hosts that resolve privately", async () => {
  const pub = async () => [{ address: "93.184.216.34", family: 4 }];
  for (const s of ["file:///etc/passwd", "ftp://x/y.json", "http://u:p@example.com/a.json", "http://example.com:8080/a.json", "http://127.0.0.1/a.json", "http://[::1]/a.json", "http://[::ffff:10.0.0.1]/a.json"]) {
    await assert.rejects(loadReports(s, pub), { message: "Could not read the Lighthouse report." }, s);
  }
  const mixed = async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }];
  await assert.rejects(fetchJson("http://rebind.example/a.json", mixed));
});

test("path: relative to the project dir, json only, errors do not echo the spec", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lh-"));
  mkdirSync(join(dir, ".lighthouseci"));
  writeFileSync(join(dir, ".lighthouseci", "lhr-1.json"), JSON.stringify(lhr("http://h/a", 0.8)));
  writeFileSync(join(dir, ".lighthouseci", "manifest.json"), "[]");
  writeFileSync(join(dir, ".lighthouseci", "notes.txt"), "x");
  writeFileSync(join(dir, "secret.txt"), "x");
  symlinkSync(join(dir, "secret.txt"), join(dir, "link.json"));
  process.env.METRICFLOW_PROJECT_DIR = dir;
  const pages = parseLighthouse(await loadReports(".lighthouseci"));
  assert.deepEqual(Object.keys(pages), ["/a"]);
  await assert.rejects(loadReports("secret.txt"), (e) => e.message === "Could not read the Lighthouse report." && !e.message.includes("secret"));
  await assert.rejects(loadReports("link.json")); // symlink resolves to a non-.json file
  await assert.rejects(loadReports("C2:\\x"), /Could not read/);
});

// --- security review follow-ups: embedded-IPv4 IPv6 forms, special IPv4 ranges, folder byte cap ---
test("blocklist covers NAT64, IPv4-compatible, 6to4, SIIT, site-local and doc ranges; public still allowed", () => {
  for (const a of ["64:ff9b::7f00:1", "64:ff9b::a9fe:a9fe", "64:ff9b:1::1", "::127.0.0.1", "::7f00:1", "2002:7f00:1::", "::ffff:0:7f00:1", "fec0::1",
    "192.0.2.1", "198.51.100.1", "203.0.113.1", "192.88.99.1"]) assert.ok(isBlockedAddress(a), a);
  for (const a of ["8.8.8.8", "2606:4700:4700::1111"]) assert.ok(!isBlockedAddress(a), a);
});

test("folder load fails past the 25 MB aggregate cap", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lh-cap-"));
  mkdirSync(join(dir, "r"));
  const pad = JSON.stringify({ x: "a".repeat(4.5 * 1024 * 1024) });
  for (let i = 0; i < 6; i++) writeFileSync(join(dir, "r", `f${i}.json`), pad); // 6 x ~4.5 MB > 25 MB
  process.env.METRICFLOW_PROJECT_DIR = dir;
  await assert.rejects(loadReports("r"), /Could not read/);
});

test("folder load fails past 200 .json files; 200 is fine and non-.json files do not count", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lh-count-"));
  mkdirSync(join(dir, "r"));
  const body = JSON.stringify(lhr("http://h/a", 0.8));
  for (let i = 0; i < 200; i++) writeFileSync(join(dir, "r", `f${i}.json`), body);
  writeFileSync(join(dir, "r", "extra.txt"), "x");
  process.env.METRICFLOW_PROJECT_DIR = dir;
  assert.equal((await loadReports("r")).length, 200);
  writeFileSync(join(dir, "r", "f200.json"), body);
  await assert.rejects(loadReports("r"), /Could not read/);
});

test("a file over 5 MB fails, alone or in a folder", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lh-file-"));
  mkdirSync(join(dir, "r"));
  const big = JSON.stringify({ x: "a".repeat(5 * 1024 * 1024) });
  writeFileSync(join(dir, "big.json"), big);
  writeFileSync(join(dir, "r", "big.json"), big);
  writeFileSync(join(dir, "r", "ok.json"), JSON.stringify(lhr("http://h/a", 0.8)));
  process.env.METRICFLOW_PROJECT_DIR = dir;
  await assert.rejects(loadReports("big.json"), /Could not read/);
  await assert.rejects(loadReports("r"), /Could not read/);
});
