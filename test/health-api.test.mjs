import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load, req } from "./helpers.mjs";

const { version } = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"));
const { GET } = await load("app/api/health/route.ts");

test("GET /api/health reports the package.json version", async () => {
  const res = await GET(req("http://localhost:3000/api/health"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "ok");
  assert.equal(body.version, version);
  assert.ok(typeof body.timestamp === "string");
});
