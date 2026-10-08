// F1 (docs/plans/tool-contract-design.md 12.1): every /api route answers local requests only, unless exposed with --host.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load, req, root } from "./helpers.mjs";

const { proxy, config } = await load("proxy.ts");

// Every route handler in the app, as { path: "/api/metrics", methods: ["GET"] }.
const routes = readdirSync(join(root, "app"), { recursive: true })
  .filter((f) => /(^|\/)route\.ts$/.test(f))
  .map((f) => ({
    path: "/" + f.replace(/\/?route\.ts$/, ""),
    methods: [...readFileSync(join(root, "app", f), "utf8").matchAll(/^export (?:async )?function ([A-Z]+)/gm)].map((m) => m[1]),
  }));
const FOREIGN = { host: "evil.example:3000" };
const CROSS_SITE = { "sec-fetch-site": "cross-site" };
const exposed = async (fn) => { process.env.METRICFLOW_EXPOSED = "1"; try { return await fn(); } finally { delete process.env.METRICFLOW_EXPOSED; } };

test("the guard covers every route handler: a new route outside /api would be unguarded", () => {
  assert.equal(config.matcher, "/api/:path*");
  assert.ok(routes.length >= 8, "route discovery found too few routes");
  for (const r of routes) {
    assert.ok(r.path.startsWith("/api/"), `${r.path} is outside the proxy matcher ${config.matcher}`);
    assert.ok(r.methods.length, `${r.path}: no exported method found`);
  }
});

for (const { path, methods } of routes) for (const method of methods) {
  const call = (headers) => proxy(req(`http://localhost:3000${path}`, { method, headers }));

  test(`${method} ${path}: local request passes (any port, same-origin browser, curl)`, () => {
    for (const host of ["localhost:3000", "127.0.0.1:43177", "[::1]:3000"]) assert.equal(call({ host }), undefined, host);
    for (const site of ["same-origin", "same-site", "none"]) assert.equal(call({ "sec-fetch-site": site, origin: "http://localhost:3000" }), undefined, site);
  });

  test(`${method} ${path}: foreign Host (DNS rebinding) and cross-site are refused with the usual 403`, async () => {
    for (const headers of [FOREIGN, CROSS_SITE]) {
      const res = call({ ...headers, authorization: "Bearer FAKE-SECRET-0000" });
      assert.equal(res.status, 403);
      const text = await res.text();
      assert.deepEqual(JSON.parse(text), { error: "Setup is only available from localhost." });
      assert.ok(!/evil\.example|FAKE-SECRET/.test(text), "refusal echoes a request header");
    }
  });

  test(`${method} ${path}: exposed (--host) the guard steps aside, as before`, async () => {
    await exposed(() => { for (const headers of [{}, FOREIGN, { host: "192.168.1.84:3000" }, CROSS_SITE]) assert.equal(call(headers), undefined); });
  });
}

// The unit tests above call proxy() directly; these prove Next really runs it in front of each route.
const built = existsSync(join(root, ".next/BUILD_ID"));
const skip = !built && "no .next/BUILD_ID (run npm run build)";
const fetchAs = (port, path, method, headers) => new Promise((res, rej) => {
  http.request({ host: "127.0.0.1", port, path, method, headers }, (r) => { r.resume(); r.on("end", () => res(r.statusCode)); }).on("error", rej).end();
});
async function withServer(port, args, fn) {
  const builtAt = statSync(join(root, ".next/BUILD_ID")).mtimeMs;
  for (const f of ["proxy.ts", "lib/localRequest.ts"]) assert.ok(statSync(join(root, f)).mtimeMs <= builtAt, `.next is older than ${f}: run npx next build --webpack`);
  // Fake `open` so the test never launches a browser.
  const bin = mkdtempSync(join(tmpdir(), "fakeopen-"));
  for (const n of ["open", "xdg-open"]) { writeFileSync(join(bin, n), "#!/bin/sh\n"); chmodSync(join(bin, n), 0o755); }
  const p = spawn(process.execPath, [join(root, "bin/cli.mjs"), port, "--no-open", "--json", ...args], { env: { PATH: `${bin}:${process.env.PATH}` } });
  let out = "";
  p.stdout.on("data", (d) => (out += d));
  try {
    await new Promise((res, rej) => { const t = setInterval(() => /"event":"ok"/.test(out) && (clearInterval(t), res()), 200); p.on("exit", () => rej(new Error("server exited early: " + out))); });
    await fn();
  } finally { p.kill("SIGTERM"); }
}

test("real start: every route refuses a foreign Host and a cross-site request before the handler runs", { skip, timeout: 60000 }, async () => {
  const port = "43181";
  await withServer(port, [], async () => {
    for (const { path, methods } of routes) for (const method of methods) {
      assert.equal(await fetchAs(port, path, method, FOREIGN), 403, `${method} ${path} answered a foreign Host`);
      assert.equal(await fetchAs(port, path, method, { host: `localhost:${port}`, ...CROSS_SITE }), 403, `${method} ${path} answered a cross-site request`);
    }
    // Only routes that make no outbound call are requested for real.
    for (const path of ["/api/health", "/api/timings"]) for (const host of [`localhost:${port}`, `127.0.0.1:${port}`]) {
      assert.equal(await fetchAs(port, path, "GET", { host, "sec-fetch-site": "same-origin" }), 200, `${path} refused ${host}`);
    }
  });
});

test("real start with --host 0.0.0.0: a LAN Host still reaches the open routes, setup stays off", { skip, timeout: 60000 }, async () => {
  const port = "43182";
  await withServer(port, ["--host", "0.0.0.0"], async () => {
    const lan = { host: `192.168.1.84:${port}` };
    for (const path of ["/api/health", "/api/timings"]) assert.equal(await fetchAs(port, path, "GET", lan), 200, path);
    assert.equal(await fetchAs(port, "/api/setup", "GET", lan), 403);
  });
});
