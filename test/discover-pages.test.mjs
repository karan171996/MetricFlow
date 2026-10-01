import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { buildPages, normalizePath, baseSlug, pageName, MAX_PAGES } = await load("lib/discoverPages.ts");

test("zero rows -> zero pages", () => assert.deepEqual(buildPages([]), []));

test("query strings, hashes, host, case and trailing slashes merge into one page", () => {
  const pages = buildPages([
    { url: "/Blog", views: 5 }, { url: "/blog/", views: 3 }, { url: "https://site.com/blog?utm=1#x", views: 2 }, { url: "/blog?page=2", views: 1 },
  ]);
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0], { url: "/blog", slug: "blog", name: "Blog", views: 11 });
});

test("many pages: sorted by views, capped at 20", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ url: `/p${i}`, views: i }));
  const pages = buildPages(rows);
  assert.equal(pages.length, MAX_PAGES);
  assert.equal(pages[0].url, "/p29");
  assert.equal(new Set(pages.map((p) => p.slug)).size, MAX_PAGES);
});

test("root is 'home' / 'Homepage'", () => {
  assert.equal(baseSlug("/"), "home");
  assert.equal(pageName("/"), "Homepage");
  assert.equal(normalizePath("https://site.com"), "/");
});

test("different paths that reduce to one slug get unique, stable hash suffixes", () => {
  const rows = [{ url: "/a-b", views: 2 }, { url: "/a/b", views: 1 }, { url: "/a_b", views: 1 }];
  const slugs = buildPages(rows).map((p) => p.slug);
  assert.equal(new Set(slugs).size, 3);
  assert.ok(slugs.every((s) => /^a-b-[0-9a-f]{6}$/.test(s)));
  assert.deepEqual(buildPages(rows.slice().reverse()).map((p) => p.slug).sort(), slugs.slice().sort()); // stable
});

test("odd characters never produce unsafe slugs; unusable URLs are skipped", () => {
  const pages = buildPages([
    { url: "/caf%C3%A9 menu?x=1", views: 1 }, { url: "/<script>alert(1)</script>", views: 1 }, { url: "/%E0%A4%A", views: 1 },
    { url: "", views: 5 }, { url: "   ", views: 5 }, { url: null, views: 5 }, { url: "/ok", views: NaN },
  ]);
  for (const p of pages) assert.match(p.slug, /^[a-z0-9-]+$/, p.slug);
  assert.ok(pages.some((p) => p.url === "/ok" && p.views === 0));
  assert.ok(!pages.some((p) => p.url === ""));
  assert.equal(baseSlug("/" + "x".repeat(200)).length <= 60, true);
  assert.equal(baseSlug("/%%%"), "page");
});
