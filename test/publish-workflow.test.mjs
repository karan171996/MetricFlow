// Text checks on .github/workflows/publish.yml: the release channels must not be able to move `latest`
// with a canary, and the security split between the jobs must hold. No YAML parser is installed, so
// these read the file as text, one job block at a time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Comments are dropped first, so a sentence that mentions "npm publish" or "id-token" is not mistaken for code.
const yml = readFileSync(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8")
  .split("\n")
  .map((l) => l.replace(/(^|\s)#.*$/, ""))
  .join("\n");
const job = (name) => {
  const start = yml.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, `job ${name} exists`);
  const rest = yml.slice(start + 1);
  const next = rest.slice(1).search(/\n  [a-z-]+:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
};
const build = job("build");
const publish = job("publish");
const release = job("release");

test("the channel input offers stable and canary and defaults to stable", () => {
  assert.match(yml, /inputs:\s+channel:[\s\S]*?type: choice[\s\S]*?options:\s+- stable\s+- canary\s+default: stable/);
});

test("npm publish is called once and always with an explicit dist-tag from the build job", () => {
  assert.equal((yml.match(/npm publish/g) || []).length, 1);
  assert.match(publish, /npm publish release\/\*\.tgz --tag "\$NPM_TAG" /);
  assert.match(publish, /NPM_TAG: \$\{\{ needs\.build\.outputs\.tag \}\}/);
});

test("latest can only come from the stable path, and a prerelease is refused under latest", () => {
  assert.match(build, /if \[ "\$CHANNEL" = "canary" \]; then[\s\S]*?tag="canary"[\s\S]*?else[\s\S]*?tag="latest"/);
  assert.match(build, /version="\$\{base\}-canary\.g\$\{GITHUB_SHA::7\}"/);
  assert.match(publish, /latest:\*-\*\) echo "Refusing to publish the prerelease/);
  assert.match(publish, /canary:\*-canary\.\*\) ;;/);
  assert.doesNotMatch(yml, /--tag latest/);
});

test("stable refuses a prerelease base version and an existing tag", () => {
  assert.match(build, /\*-\*\) echo "A stable release needs a plain x\.y\.z version/);
  assert.match(build, /git ls-remote --exit-code --tags origin "refs\/tags\/v\$\{base\}"/);
});

test("the build job fails before the approval when the version is already on npm", () => {
  const view = build.indexOf('npm view "${name}@${version}" version');
  assert.ok(view > 0, "build job asks the registry for the version");
  assert.ok(view > build.indexOf('tag="latest"'), "the check runs after the version is decided");
  assert.ok(view < build.indexOf('echo "version=$version" >> "$GITHUB_OUTPUT"'), "and before the outputs are written");
  assert.match(build, /is already on npm/);
  assert.doesNotMatch(publish, /npm view/);
});

test("the canary version is written only in the build job, and the tarball version is checked", () => {
  assert.match(build, /npm pkg set version="\$VERSION"/);
  assert.doesNotMatch(publish, /npm pkg set/);
  assert.match(build, /tar -xOzf release\/\*\.tgz package\/package\.json/);
  assert.match(publish, /tar -xOzf release\/\*\.tgz package\/package\.json/);
});

test("the job split holds: only publish gets id-token, only release gets contents: write", () => {
  assert.doesNotMatch(build, /id-token/);
  assert.doesNotMatch(build, /contents: write/);
  assert.match(publish, /id-token: write/);
  assert.doesNotMatch(publish, /contents: write/);
  assert.match(release, /contents: write/);
  assert.doesNotMatch(release, /id-token/);
});

test("the publish and release jobs run no repository code", () => {
  assert.doesNotMatch(publish, /actions\/checkout|pnpm |corepack|npm (install|ci|run)/);
  assert.doesNotMatch(release, /actions\/checkout|pnpm |corepack|npm |node /);
  assert.equal((yml.match(/actions\/checkout@/g) || []).length, 1);
});

test("the release job runs only after publish, only for stable, and only on main", () => {
  assert.match(release, /needs: \[build, publish\]/);
  assert.match(release, /needs\.build\.outputs\.tag == 'latest'/);
  assert.match(release, /github\.ref == 'refs\/heads\/main'/);
  assert.match(release, /gh release create "v\$\{VERSION\}"/);
});

test("every action is pinned to a commit and the environment gate stays on publish", () => {
  for (const line of yml.split("\n").filter((l) => /^\s*- uses: /.test(l))) {
    assert.match(line, /@[0-9a-f]{40}\b/, `pinned: ${line.trim()}`);
  }
  assert.match(publish, /environment: npm/);
  assert.match(yml, /--provenance/);
});
