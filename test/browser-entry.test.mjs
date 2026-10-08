// The consumer browser entry (browser/ -> dist/browser): behaviour of init/send, and the checks that keep
// the tree sealed (no server code, no secret name, no import that leaves the tree) in source, build and tarball.
// Fake identifiers only; the two vendor SDKs are mocked, so nothing is sent anywhere.
import { test, mock, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { root, load } from "./helpers.mjs";

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const tsc = join(root, "node_modules/typescript/bin/tsc");
const runTsc = (cwd, ...args) => spawnSync(process.execPath, [tsc, ...args], { cwd, encoding: "utf8" });

// The only vendor specifiers the tree may name. Anything else, including a replay package, fails the check.
const ALLOWED_BARE = [
  "@sentry/browser",
  "@newrelic/browser-agent/loaders/agent",
  ...["ajax", "generic_events", "jserrors", "page_view_event", "page_view_timing"].map((f) => `@newrelic/browser-agent/features/${f}`),
];

const { TOOLS } = await load("lib/tools.ts");
const { AI_PROVIDERS, AI_PROVIDER_KEY } = await load("lib/env.ts");
/** Derived from the registry, so a new tool's secret is covered the day it is added. */
const FORBIDDEN_NAMES = [
  ...Object.values(TOOLS).flatMap((t) => [...t.keys.required, ...t.keys.optional, ...(t.keys.derived ?? [])]).filter((n) => !n.startsWith("NEXT_PUBLIC_")),
  ...Object.values(AI_PROVIDERS).map((p) => p.key),
  AI_PROVIDER_KEY,
];
const FORBIDDEN_TEXT = ["process.env", "node:", "axios", "lib/env", "require("];

const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

/**
 * Returns every violation in a browser tree (empty = sealed). Deliberately strict: it reads raw text,
 * comments included, so a comment that quotes an import or names a secret fails too.
 */
function checkBrowserTree(dir) {
  const bad = [];
  for (const file of walk(dir)) {
    const rel = relative(dir, file);
    const text = readFileSync(file, "utf8");
    for (const name of FORBIDDEN_NAMES) if (text.includes(name)) bad.push(`${rel}: names ${name}`);
    for (const t of FORBIDDEN_TEXT) if (text.includes(t)) bad.push(`${rel}: contains ${t}`);

    // Every specifier is resolved to a path, never string-matched.
    const specs = [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'`])([^"'`]*)\1/g)].map((m) => m[2]);
    const dynamic = text.match(/\bimport\s*\(/g)?.length ?? 0;
    const literal = text.match(/\bimport\s*\(\s*(["'])[^"'`$]*\1\s*\)/g)?.length ?? 0;
    if (dynamic !== literal) bad.push(`${rel}: import() with a specifier that is not a plain string`);
    for (const spec of specs) {
      if (spec.startsWith(".")) {
        const target = resolve(dirname(file), spec);
        if (relative(dir, target).startsWith("..")) bad.push(`${rel}: import leaves the tree: ${spec}`);
        else if (![target, target.replace(/\.mjs$/, ".mts")].some(existsSync)) bad.push(`${rel}: import does not resolve: ${spec}`);
      } else if (!ALLOWED_BARE.includes(spec)) bad.push(`${rel}: import not allowed: ${spec}`);
    }
    // No static import in the entry: a site that never calls init must download nothing else.
    if (/^index\.m[jt]s$/.test(rel) && /^\s*import\s+(?!type\b)[^(]|^\s*export\s[^;]*\bfrom\b/m.test(text)) bad.push(`${rel}: static import in the entry`);
  }
  return bad;
}

let packed; // extracted tarball root
before(() => {
  const built = runTsc(root, "-p", "tsconfig.browser.json");
  assert.equal(built.status, 0, built.stdout);
  const out = mkdtempSync(join(tmpdir(), "mf-pack-"));
  const [{ filename }] = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", out, "--cache", join(tmpdir(), "npm-pack-cache")], { cwd: root, encoding: "utf8" }));
  execFileSync("tar", ["-xzf", join(out, filename.replace("@", "").replace("/", "-")), "-C", out]);
  packed = join(out, "package");
});

test("build check: source, a fresh build and the packed tarball are all sealed", () => {
  const fresh = mkdtempSync(join(tmpdir(), "mf-browser-out-"));
  const r = runTsc(root, "-p", "tsconfig.browser.json", "--outDir", fresh);
  assert.equal(r.status, 0, r.stdout);
  for (const dir of [join(root, "browser"), fresh, join(packed, "dist/browser")]) {
    assert.ok(walk(dir).length >= 5, `${dir} has the five modules`);
    assert.deepEqual(checkBrowserTree(dir), [], dir);
  }
});

test("build check rejects every violation (a clean tree passes, so the check is not vacuous)", () => {
  const tree = (files) => {
    const dir = join(mkdtempSync(join(tmpdir(), "mf-neg-")), "browser");
    mkdirSync(dir);
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return checkBrowserTree(dir);
  };
  const ok = "export const tool = {};\n";
  assert.deepEqual(tree({ "index.mjs": "export const init = () => import('./sentry.mjs');\n", "sentry.mjs": "await import('@sentry/browser');\n" }), []);

  const cases = {
    "relative import that leaves the tree": { "index.mjs": ok, "sentry.mjs": "import { parseSentryDsn } from '../lib/sentryDsn.js';\n" },
    "escape that starts with ./": { "index.mjs": ok, "sentry.mjs": "await import('./x/../../lib/y.js');\n" },
    "alias import": { "index.mjs": ok, "sentry.mjs": "import { env } from '@/lib/tools';\n" },
    "bare import not on the list": { "index.mjs": ok, "sentry.mjs": "await import('@sentry/replay');\n" },
    "the full New Relic loader": { "index.mjs": ok, "newrelic.mjs": "await import('@newrelic/browser-agent/loaders/browser-agent');\n" },
    "computed import()": { "index.mjs": ok, "sentry.mjs": "const name = './sentry.mjs'; await import(name);\n" },
    "template import()": { "index.mjs": ok, "sentry.mjs": "await import(`./${'x'}.mjs`);\n" },
    "static import in the entry": { "index.mjs": "import { tool } from './sentry.mjs';\n", "sentry.mjs": ok },
    "re-export in the entry": { "index.mjs": "export { tool } from './sentry.mjs';\n", "sentry.mjs": ok },
    "reads the environment": { "index.mjs": "export const k = process.env.NEXT_PUBLIC_X;\n" },
    "node builtin": { "index.mjs": ok, "sentry.mjs": "await import('node:fs');\n" },
    "http client": { "index.mjs": ok, "sentry.mjs": "await import('axios');\n" },
    "CommonJS require": { "index.mjs": "const fs = require('fs');\n" },
    "unresolved relative import": { "index.mjs": "export const init = () => import('./missing.mjs');\n" },
  };
  // C2.4 names these three; the rest come from the registry.
  for (const name of new Set(["NEWRELIC_API_KEY", "SENTRY_API_KEY", "NEWRELIC_INSERT_KEY", ...FORBIDDEN_NAMES])) cases[`names ${name}`] = { "index.mjs": `// ${name}\n` };
  for (const [what, files] of Object.entries(cases)) assert.notDeepEqual(tree(files), [], `not rejected: ${what}`);
});

test("tsconfig.browser.json seals the tree: an import of lib/, the @/ alias and Node globals do not compile", () => {
  // Inside the repo (dist/ is ignored) so node_modules/@types/node is in reach and `types: []` is what keeps it out.
  mkdirSync(join(root, "dist"), { recursive: true });
  const dir = mkdtempSync(join(root, "dist/.sealed-"));
  try {
    cpSync(join(root, "tsconfig.browser.json"), join(dir, "tsconfig.browser.json"));
    mkdirSync(join(dir, "browser"));
    mkdirSync(join(dir, "lib"));
    writeFileSync(join(dir, "lib/sentryDsn.ts"), "export const x = 1;\n");
    const compile = (source) => {
      writeFileSync(join(dir, "browser/index.mts"), source);
      return runTsc(dir, "-p", "tsconfig.browser.json", "--outDir", join(dir, "out"));
    };
    assert.equal(compile("export const ok = typeof window;\n").status, 0, "a clean file compiles");
    const outside = compile("export { x } from '../lib/sentryDsn.js';\n");
    assert.notEqual(outside.status, 0);
    assert.match(outside.stdout, /TS6059/, "rootDir rejects a file outside browser/");
    assert.notEqual(compile("import { TOOLS } from '@/lib/tools';\nexport const t = TOOLS;\n").status, 0, "no @/ alias");
    assert.match(compile("export const k = process.env.X;\n").stdout, /Cannot find name 'process'/, "no Node types");
    assert.notEqual(compile("import { readFileSync } from 'node:fs';\nexport const r = readFileSync;\n").status, 0, "no node: modules");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("package: exports point at shipped files, dist holds only the built modules, both SDKs are exact pins", () => {
  const files = walk(packed).map((f) => relative(packed, f));
  const dist = files.filter((f) => f.startsWith("dist"));
  assert.deepEqual(dist.sort(), ["index", "newrelic", "newrelic-agent", "sentry", "sentry-sdk"].flatMap((n) => [`dist/browser/${n}.d.mts`, `dist/browser/${n}.mjs`]).sort());
  assert.ok(!files.some((f) => /^browser\/|\.map$|(^|\/)\.env/.test(f)), "no browser sources, source maps or env files in the tarball");
  const shipped = JSON.parse(readFileSync(join(packed, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(shipped.exports), ["./browser", "./package.json"]);
  for (const target of Object.values(shipped.exports["./browser"])) assert.ok(files.includes(target.slice(2)), `${target} is in the tarball`);
  // The lockfile is not published: a range would let a consumer install an SDK version nobody here reviewed.
  for (const sdk of ["@sentry/browser", "@newrelic/browser-agent"]) assert.match(shipped.dependencies[sdk], /^\d+\.\d+\.\d+$/, `${sdk} is pinned exactly`);
  assert.equal(shipped.scripts.prepublishOnly, "pnpm run build");
  assert.match(shipped.scripts.build, /build:browser/);
});

test("neither SDK, nor anything it brings, has an install script; allowBuilds is unchanged", () => {
  const seen = new Map();
  // Node's own lookup (nearest node_modules going up), done by hand: `exports` hides package.json in some packages.
  const visit = (name, from) => {
    let up = from;
    while (!existsSync(join(up, "node_modules", name, "package.json"))) {
      assert.notEqual(up, dirname(up), `${name} not found from ${from}`);
      up = dirname(up);
    }
    const dir = realpathSync(join(up, "node_modules", name));
    if (seen.has(dir)) return;
    const p = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    seen.set(dir, p);
    for (const dep of Object.keys({ ...p.dependencies, ...p.optionalDependencies })) visit(dep, dir);
  };
  for (const sdk of ["@sentry/browser", "@newrelic/browser-agent"]) visit(sdk, root);
  assert.ok(seen.size > 5, "walked the dependency tree");
  const withScripts = [...seen.values()].filter((p) => ["preinstall", "install", "postinstall"].some((s) => p.scripts?.[s])).map((p) => p.name);
  assert.deepEqual(withScripts, []);
  const allow = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8").match(/^allowBuilds:\n((?: {2}.*\n)+)/m)[1];
  assert.deepEqual(allow.trim().split("\n").map((l) => l.trim()), ["cypress: true", "unrs-resolver: true"]);
});

// ---------- behaviour of init / send, against the built entry ----------

const HEX32 = "0123456789abcdef".repeat(2); // a fake public key: 32 hex characters
const DSN = `https://${HEX32}@o123.ingest.sentry.io/456`;
const NR = { browserKey: "NRJS-fake0000", applicationId: "123456789", accountId: "1234567" };
const SECRET_TEXT = "MetricFlow: a secret key was passed to init for TOOL. Nothing was sent. This key is already in your site's public JavaScript: revoke it now and create a new one.";

const seen = { getClient: 0, sentryInit: [], tracing: [], agents: [], events: [], failSentry: false, failNewRelic: false };
mock.module("@sentry/browser", {
  namedExports: {
    getClient: () => void seen.getClient++,
    init(options) { if (seen.failSentry) throw new Error(`FAKE vendor failure ${options.dsn}`); seen.sentryInit.push(options); },
    browserTracingIntegration: (options) => { seen.tracing.push(options); return { name: "BrowserTracing" }; },
  },
});
class Agent {
  constructor(options) { if (seen.failNewRelic) throw new Error(`FAKE vendor failure ${options.info.licenseKey}`); seen.agents.push(options); }
  recordCustomEvent(type, attributes) { seen.events.push([type, attributes]); }
}
mock.module("@newrelic/browser-agent/loaders/agent", { namedExports: { Agent } });
for (const [feature, name] of Object.entries({ ajax: "Ajax", generic_events: "GenericEvents", jserrors: "JSErrors", page_view_event: "PageViewEvent", page_view_timing: "PageViewTiming" })) {
  mock.module(`@newrelic/browser-agent/features/${feature}`, { namedExports: { [name]: { featureName: feature } } });
}

const realWarn = console.warn;
let warnings = [];
let fresh = 0;
/** A new copy of the entry (its "already called" flag is module state), with a browser-like `window`. */
async function entry({ window: win = {}, hostname = "localhost" } = {}) {
  Object.assign(seen, { getClient: 0, sentryInit: [], tracing: [], agents: [], events: [], failSentry: false, failNewRelic: false });
  warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  if (win !== null) globalThis.window = { location: { hostname, pathname: "/checkout" }, ...win };
  return import(`${pathToFileURL(join(root, "dist/browser/index.mjs")).href}?copy=${fresh++}`);
}
afterEach(() => { console.warn = realWarn; delete globalThis.window; });
const sentryLoaded = () => seen.getClient > 0; // the first thing sentry-sdk does with the SDK
const nothingStarted = () => !sentryLoaded() && seen.sentryInit.length === 0 && seen.agents.length === 0;

test("without window (SSR, next build) init does nothing, and a later browser call still works", async () => {
  const { init, send } = await entry({ window: null });
  assert.equal(await init({ sentry: { dsn: DSN }, "new-relic": NR }), undefined);
  send("x", 1);
  assert.ok(nothingStarted());
  assert.deepEqual(warnings, []);
});

test("only the named tool is loaded; never calling init loads nothing", async () => {
  await entry();
  assert.ok(nothingStarted(), "import alone starts nothing");

  let m = await entry();
  await m.init({ "new-relic": NR });
  assert.equal(seen.agents.length, 1);
  assert.ok(!sentryLoaded() && seen.sentryInit.length === 0, "Sentry not loaded for a New Relic-only init");

  m = await entry();
  await m.init({ sentry: { dsn: DSN } });
  assert.equal(seen.sentryInit.length, 1);
  assert.equal(seen.agents.length, 0, "New Relic not loaded for a Sentry-only init");
  assert.deepEqual(warnings, []);
});

test("both tools start with the privacy defaults and only the needed New Relic features", async () => {
  const { init } = await entry();
  await init({ sentry: { dsn: DSN }, "new-relic": { ...NR, region: "eu" } });

  const [s] = seen.sentryInit;
  assert.equal(s.dsn, DSN);
  assert.equal(s.sendDefaultPii, false);
  assert.equal(s.tracesSampleRate, 1, "localhost default");
  assert.deepEqual(s.integrations, [{ name: "BrowserTracing" }], "tracing only: no replay, feedback or profiling");
  assert.deepEqual(seen.tracing[0].beforeStartSpan({ name: "/posts/[slug]", op: "pageload" }), { name: "/checkout", op: "pageload" });
  // A navigation span starts while location is still the page being left: its name must not be touched.
  const navigation = { name: "/orders/8841", op: "navigation" };
  assert.equal(seen.tracing[0].beforeStartSpan(navigation), navigation);

  const [a] = seen.agents;
  assert.equal(a.init.session_replay.enabled, false);
  assert.equal(a.init.privacy.cookies_enabled, false);
  assert.deepEqual(a.features.map((f) => f.featureName).sort(), ["ajax", "generic_events", "jserrors", "page_view_event", "page_view_timing"]);
  assert.equal(a.info.beacon, "bam.eu01.nr-data.net");
  assert.deepEqual([a.info.licenseKey, a.info.applicationID, a.loader_config.accountID], [NR.browserKey, NR.applicationId, NR.accountId]);
  assert.deepEqual(warnings, []);
});

test("sample rate: 1 on localhost and 127.0.0.1, 0.1 elsewhere, and the caller's value wins", async () => {
  for (const [hostname, options, expected] of [["127.0.0.1", {}, 1], ["shop.example", {}, 0.1], ["shop.example", { tracesSampleRate: 0 }, 0], ["localhost", { tracesSampleRate: 0.25 }, 0.25]]) {
    const { init } = await entry({ hostname });
    await init({ sentry: { dsn: DSN, ...options } });
    assert.equal(seen.sentryInit[0].tracesSampleRate, expected, hostname);
  }
});

test("second init does nothing and warns once", async () => {
  const { init } = await entry();
  await init({ "new-relic": NR });
  await init({ sentry: { dsn: DSN } });
  await init({ sentry: { dsn: DSN } });
  assert.equal(seen.agents.length, 1);
  assert.ok(!sentryLoaded());
  assert.deepEqual(warnings, ["MetricFlow: init was already called; this call did nothing."]);
});

test("a secret is refused: nothing starts, one fixed warning says revoke, and the value is never printed", async () => {
  const hex64 = "f".repeat(64);
  const cases = [
    ...["NRAK", "NRII", "NRRA", "NRIQ", "NRAA", "nrak"].map((p) => [`${p}-FAKE0000`, "New Relic", { "new-relic": { ...NR, browserKey: `${p}-FAKE0000` } }]),
    ["FAKE0000NRAL", "New Relic", { "new-relic": { ...NR, browserKey: "FAKE0000NRAL" } }],
    ["NRAK-FAKE0000", "New Relic", { "new-relic": { ...NR, apiKey: "NRAK-FAKE0000" } }], // under a name init does not know
    ["sntrys_FAKE0000", "Sentry", { sentry: { dsn: "sntrys_FAKE0000" } }], // not a URL: new URL() would throw with the input in its message
    ["sntryu_FAKE0000", "Sentry", { sentry: { dsn: "sntryu_FAKE0000" } }],
    [hex64, "Sentry", { sentry: { dsn: hex64 } }],
    ["sntrys_FAKE0000", "Sentry", { sentry: { dsn: `https://sntrys_FAKE0000@o123.ingest.sentry.io/456` } }], // token in the DSN's user part
    [hex64, "Sentry", { sentry: { dsn: `https://${hex64}@o123.ingest.sentry.io/456` } }],
    [hex64, "Sentry", { sentry: { dsn: `https://${HEX32}:${hex64}@o123.ingest.sentry.io/456` } }], // password part
    ["NRAK-FAKE0000", "Sentry", { sentry: { dsn: `https://${HEX32}@o123.ingest.sentry.io/NRAK-FAKE0000` }, "new-relic": NR }], // in the path
    ["NRAK-FAKE0000", "an unknown tool", { sentry: { dsn: DSN }, constructor: { key: "NRAK-FAKE0000" } }],
  ];
  for (const [value, label, options] of cases) {
    const { init, send } = await entry();
    await init(options);
    send("x", 1);
    assert.ok(nothingStarted() && seen.events.length === 0, `started with ${label}`);
    assert.deepEqual(warnings, [SECRET_TEXT.replace("TOOL", label)]);
    assert.ok(!warnings[0].includes(value));
  }
});

test("a malformed value is refused: no tool starts (not even the valid one), one fixed warning without the value", async () => {
  const cases = [
    [{ sentry: { dsn: `https://not-a-key@o123.ingest.sentry.io/456` } }, "not-a-key", /^MetricFlow: Sentry was not started: the DSN is not a public Sentry DSN\./],
    [{ sentry: { dsn: `https://${HEX32}:legacysecret@o123.ingest.sentry.io/456` } }, "legacysecret", /^MetricFlow: Sentry was not started: the DSN is a legacy one .* revoke the old key\./],
    [{ sentry: { dsn: `https://${HEX32}@o123.ingest.sentry.io/my-project` } }, "my-project", /the DSN is not a public Sentry DSN/],
    [{ sentry: { dsn: `ftp://${HEX32}@o123.ingest.sentry.io/456` } }, "ftp", /the DSN is not a public Sentry DSN/],
    [{ sentry: { dsn: "definitely not a url" } }, "definitely", /the DSN is not a public Sentry DSN/],
    [{ sentry: { dsn: 42 } }, "42", /the DSN is not a public Sentry DSN/],
    ...[2, -1, NaN, "0.5"].map((rate) => [{ sentry: { dsn: DSN, tracesSampleRate: rate } }, "tracesSampleRate: " + rate, /tracesSampleRate must be a number from 0 to 1\./]),
    [{ sentry: { dsn: DSN, replaysSessionSampleRate: 1 } }, "replaysSessionSampleRate", /only "dsn" and "tracesSampleRate" are accepted\./],
    [{ "new-relic": { ...NR, browserKey: "NRJS-fake 0000" } }, "fake 0000", /^MetricFlow: New Relic was not started: browserKey must be/],
    [{ "new-relic": { ...NR, browserKey: "NRJS-fake$0000" } }, "fake$0000", /browserKey must be/],
    [{ "new-relic": { ...NR, browserKey: "fake0000" } }, "fake0000", /browserKey must be/],
    [{ "new-relic": { ...NR, applicationId: "app-1" } }, "app-1", /applicationId and accountId must be plain numbers/],
    [{ "new-relic": { ...NR, accountId: 1234567 } }, "1234567", /applicationId and accountId must be plain numbers/],
    [{ "new-relic": { ...NR, region: "apac" } }, "apac", /region must be "us" or "eu"\./],
    [{ "new-relic": { ...NR, licenseKey: "abc" } }, "licenseKey", /only "browserKey", "applicationId", "accountId" and "region" are accepted\./],
    [{ sentry: { dsn: DSN }, "new-relic": { ...NR, region: "apac" } }, "apac", /New Relic was not started.* No tool was started\.$/], // the valid Sentry must not start
    [{ sentry: "just a string" }, "just a string", /Sentry was not started/],
  ];
  for (const [options, value, expected] of cases) {
    const { init } = await entry();
    await init(options);
    assert.ok(nothingStarted(), `started with ${value}`);
    assert.equal(warnings.length, 1, value);
    assert.match(warnings[0], expected);
    assert.match(warnings[0], /No tool was started\.$/);
    assert.ok(!warnings[0].includes(value), `warning repeats the input: ${value}`);
  }
  for (const bad of [undefined, null, "NRJS-fake0000"]) {
    const { init } = await entry();
    await init(bad);
    assert.ok(nothingStarted());
    assert.deepEqual(warnings, ["MetricFlow: init needs an options object. No tool was started."]);
  }
});

test("a mistyped tool name or an empty call is not silent: one fixed warning, nothing starts, the key is not printed", async () => {
  const unknown = 'MetricFlow: init was given an option that is not a tool. The tools are "sentry" and "new-relic". No tool was started.';
  const none = 'MetricFlow: init was not given a tool. Name "sentry", "new-relic" or both. No tool was started.';
  for (const [options, expected] of [
    [{ newrelic: NR }, unknown],
    [{ sentry: { dsn: DSN }, Sentri: { dsn: DSN } }, unknown], // the valid tool does not start either
    [{}, none],
    [{ sentry: undefined }, none],
  ]) {
    const { init } = await entry();
    await init(options);
    assert.ok(nothingStarted());
    assert.deepEqual(warnings, [expected]);
  }
});

test("an SDK that is already on the page is left alone: checked before our import, said once", async () => {
  let m = await entry({ window: { __SENTRY__: {} } });
  await m.init({ sentry: { dsn: DSN }, "new-relic": NR });
  assert.ok(!sentryLoaded() && seen.sentryInit.length === 0, "our Sentry was not imported");
  assert.equal(seen.agents.length, 1, "New Relic still starts");
  assert.deepEqual(warnings, ["MetricFlow: Sentry is already running on this page; MetricFlow left it as it is."]);

  for (const global of ["NREUM", "newrelic"]) {
    m = await entry({ window: { [global]: {} } });
    await m.init({ sentry: { dsn: DSN }, "new-relic": NR });
    assert.equal(seen.agents.length, 0, `agent constructed although window.${global} exists`);
    assert.equal(seen.sentryInit.length, 1, "Sentry still starts");
    assert.deepEqual(warnings, ["MetricFlow: New Relic is already running on this page; MetricFlow left it as it is."]);
  }
});

test("a failing SDK does not reject init or stop the other tool; the warning carries no error text", async () => {
  let m = await entry();
  seen.failSentry = true;
  assert.equal(await m.init({ sentry: { dsn: DSN }, "new-relic": NR }), undefined);
  assert.equal(seen.agents.length, 1);
  assert.deepEqual(warnings, ["MetricFlow: Sentry could not be started. Your site is not affected."]);

  m = await entry();
  seen.failNewRelic = true;
  await m.init({ sentry: { dsn: DSN }, "new-relic": NR });
  m.send("x", 1);
  assert.equal(seen.sentryInit.length, 1);
  assert.deepEqual(warnings, ["MetricFlow: New Relic could not be started. Your site is not affected."]);
});

test("send: nothing before init, MetricFlowEvent through New Relic after, never throws", async () => {
  const { init, send } = await entry();
  send("early", 1);
  assert.deepEqual(seen.events, []);
  await init({ sentry: { dsn: DSN }, "new-relic": NR });
  send("checkout_step", 2, { step: "payment" });
  send("plain", 3);
  send("ignored", "not a number");
  send(undefined, 1);
  send("real_name", 4, { name: "spoofed", value: 99, page: "/elsewhere", kept: true }); // the fixed fields win
  assert.deepEqual(seen.events, [
    ["MetricFlowEvent", { name: "checkout_step", value: 2, page: "/checkout", step: "payment" }],
    ["MetricFlowEvent", { name: "plain", value: 3, page: "/checkout" }],
    ["MetricFlowEvent", { name: "real_name", value: 4, page: "/checkout", kept: true }],
  ]);
  Agent.prototype.recordCustomEvent = () => { throw new Error("FAKE"); };
  assert.doesNotThrow(() => send("x", 1));
});

test("package.json keeps its consumer README promises: the documented import exists", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  assert.ok(readme.includes(`from '${pkg.name}/browser'`), "README shows the import");
  for (const text of ["instrumentation-client", "connect-src", "bam.nr-data.net", "after your own Sentry", "location.pathname"]) assert.ok(readme.includes(text), `README mentions ${text}`);
});
