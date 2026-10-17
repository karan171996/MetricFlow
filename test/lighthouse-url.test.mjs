// Lighthouse URL loader against a local stub server.
// The guard rejects loopback and any port but 80/443, so a stub cannot be reached through the product code as-is. The test hook:
// http.request is wrapped so the REAL guarded lookup still runs (injected lookup returns a "public" address and must pass the
// blocklist), and only then is the connection pointed at 127.0.0.1:<stub port>. Production code is untouched.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { load } from "./helpers.mjs";

const { fetchJson } = await load("lib/lighthouseSource.ts");

let hits = [];
let handler = (req, res) => res.end("{}");
const server = http.createServer((req, res) => { hits.push(req.url); handler(req, res); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const stubPort = server.address().port;
after(() => { server.closeAllConnections(); server.close(); http.request = realRequest; });

const realRequest = http.request;
http.request = (opts, cb) => {
  const guarded = opts.lookup;
  return realRequest({
    ...opts, port: stubPort,
    lookup: (host, o, done) => guarded(host, o, (err, a, f) => {
      if (err) return done(err);
      const first = Array.isArray(a) ? a[0] : { address: a, family: f };
      void first; // the guard passed: connect to the stub instead
      return o.all ? done(null, [{ address: "127.0.0.1", family: 4 }]) : done(null, "127.0.0.1", 4);
    }),
  }, cb);
};

const pub = async () => [{ address: "93.184.216.34", family: 4 }];
const json = (res, body = "{}", type = "application/json") => { res.writeHead(200, { "content-type": type }); res.end(body); };
const redirect = (res, to) => { res.writeHead(302, { location: to }); res.end(); };
const reset = (h) => { hits = []; handler = h; };

test("stub path: a public-resolving host over http:80 is fetched and parsed", async () => {
  reset((q, res) => json(res, '{"a":1}'));
  assert.deepEqual(await fetchJson("http://lh.example/r.json", pub), { a: 1 });
  assert.deepEqual(hits, ["/r.json"]);
});

test("content-type: charset parameter and +json accepted; html, plain, missing refused", async () => {
  for (const t of ["application/json; charset=utf-8", "APPLICATION/JSON;charset=UTF-8", "application/vnd.lhr+json"]) {
    reset((q, res) => json(res, "[1]", t));
    assert.deepEqual(await fetchJson("http://lh.example/r.json", pub), [1], t);
  }
  for (const t of ["text/html", "text/plain", "application/jsonx", "application/x-ndjson"]) {
    reset((q, res) => json(res, "[1]", t));
    await assert.rejects(fetchJson("http://lh.example/r.json", pub), { reason: "notJson" }, t);
  }
  reset((q, res) => { res.writeHead(200); res.end("[1]"); });
  await assert.rejects(fetchJson("http://lh.example/r.json", pub), { reason: "notJson" });
});

test("non-200 and a json content-type with a non-JSON body are refused", async () => {
  reset((q, res) => { res.writeHead(404, { "content-type": "application/json" }); res.end("{}"); });
  await assert.rejects(fetchJson("http://lh.example/r.json", pub), { reason: "unreadable" });
  reset((q, res) => json(res, "<html>secret</html>"));
  await assert.rejects(fetchJson("http://lh.example/r.json", pub), { message: "Could not read the Lighthouse report.", reason: "notJson" });
});

test("redirects: three are followed, the fourth is refused after exactly four requests", async () => {
  reset((q, res) => redirect(res, "/loop"));
  await assert.rejects(fetchJson("http://lh.example/loop", pub), { message: "Could not read the Lighthouse report." });
  assert.equal(hits.length, 4);
  reset((q, res) => (hits.length <= 3 ? redirect(res, "/n" + hits.length) : json(res, "[]")));
  assert.deepEqual(await fetchJson("http://lh.example/start", pub), []); // 3 redirects then the body
  assert.equal(hits.length, 4);
});

test("redirect to a private literal, a privately-resolving host, a bad port or a bad scheme is blocked and never requested", async () => {
  const lookup = async (h) => [{ address: h === "internal.example" ? "10.0.0.5" : "93.184.216.34", family: 4 }];
  for (const to of ["http://10.0.0.5/x.json", "http://127.0.0.1/x.json", "http://[::1]/x.json", "http://169.254.169.254/latest", "http://internal.example/x.json", "http://lh.example:8080/x.json", "file:///etc/passwd", "ftp://lh.example/x.json", "http://u:p@lh.example/x.json"]) {
    reset((q, res) => redirect(res, to));
    await assert.rejects(fetchJson("http://lh.example/r.json", lookup), { reason: "blocked" }, to);
    assert.equal(hits.length, 1, `${to}: only the first hop may reach the stub`);
  }
});

test("redirect without a Location header is refused", async () => {
  reset((q, res) => { res.writeHead(302); res.end(); });
  await assert.rejects(fetchJson("http://lh.example/r.json", pub));
});

test("body over 5MB is aborted; a body under it is read", async () => {
  const MB = 1024 * 1024;
  reset((q, res) => { res.writeHead(200, { "content-type": "application/json" }); res.write('["' + "a".repeat(5 * MB)); res.end('"]'); });
  await assert.rejects(fetchJson("http://lh.example/big.json", pub), { reason: "tooLarge" });
  reset((q, res) => json(res, '["' + "a".repeat(4 * MB) + '"]'));
  assert.equal((await fetchJson("http://lh.example/ok.json", pub))[0].length, 4 * MB);
});

test("timeout: a server that never answers is cut off at the deadline", async () => {
  reset(() => {}); // never responds
  const realNow = Date.now;
  let n = 0;
  const t0 = realNow();
  Date.now = () => (n++ === 0 ? t0 : t0 + 9_900); // the 10s deadline is read once; later reads see 100ms left
  const started = realNow();
  try { await assert.rejects(fetchJson("http://lh.example/slow.json", pub), { reason: "timeout" }); } finally { Date.now = realNow; }
  assert.ok(realNow() - started < 3_000, "should abort well before 3s");
});

test("rebind: a host that resolves public once then private never connects on the second lookup", async () => {
  let calls = 0;
  const rebind = async () => [{ address: ++calls === 1 ? "93.184.216.34" : "10.0.0.5", family: 4 }];
  reset((q, res) => (q.url === "/first" ? redirect(res, "/second") : json(res)));
  await assert.rejects(fetchJson("http://rebind.example/first", rebind), { reason: "blocked" });
  assert.equal(calls, 2);
  assert.deepEqual(hits, ["/first"], "the private second resolution must not reach the stub");
  // a mixed answer (one public, one private) is refused outright
  reset((q, res) => json(res));
  await assert.rejects(fetchJson("http://mixed.example/a.json", async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }]), { reason: "blocked" });
  assert.deepEqual(hits, []);
  // an empty answer and a lookup error are refused too
  await assert.rejects(fetchJson("http://none.example/a.json", async () => []), { reason: "blocked" });
  await assert.rejects(fetchJson("http://err.example/a.json", async () => { throw new Error("ENOTFOUND secret-host"); }));
  assert.deepEqual(hits, []);
});
