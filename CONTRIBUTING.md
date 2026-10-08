# Contributing to MetricFlow

Thanks for helping. Nobody pushes straight to `main`: every change comes in as a pull request (PR), and the maintainer reviews and merges it.

## Raise a PR in 6 steps

1. **Fork** the repo on GitHub and clone your fork.
2. **Set up** (needs Node `>=20.12` and [pnpm](https://pnpm.io); `corepack enable` installs the pinned version):

   ```bash
   pnpm install
   git config core.hooksPath .githooks   # turns on the local checks below
   cp .env.local.example .env.local      # only if you need real data; the tests use fake keys
   ```

3. **Branch** from `main`, named `type/short-description`:

   ```bash
   git switch -c fix/empty-newrelic-response
   ```

4. **Change and check:**

   ```bash
   pnpm lint
   pnpm test
   ```

5. **Commit** with a message in the format below.
6. **Push** to your fork and open a PR against `main`. Fill in the template.

## Commit messages and PR titles

Both use one format:

```
type(scope): description
```

- `scope` is optional: the area you touched, like `cli`, `api`, `ui`, `readme`.
- The description is lowercase, in the present tense, with no full stop. Keep the first line to 72 characters.
- Add `!` after the type or scope for a breaking change: `feat(cli)!: drop the --old flag`.

| Type | Use it for |
| --- | --- |
| `feat` | A new feature users can see or use |
| `fix` | A bug fix |
| `docs` | README, CONTRIBUTING or other docs only |
| `style` | Formatting only; no behavior change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | A change that makes something faster |
| `test` | Adding or fixing tests |
| `build` | Build, dependencies, packaging (`package.json`, lockfile) |
| `ci` | GitHub Actions and git hooks |
| `chore` | Anything else that isn't user-facing, like version bumps |
| `revert` | Undoing an earlier commit |

Examples:

```
feat(ui): add a Sentry page under Tools
fix(api): handle an empty New Relic response
docs(readme): explain where to find the Sentry token
chore(release): 0.1.7
```

Not accepted: `Readme updated`, `fix:gitIgnore update` (no space after the colon), `Fix: x` (type must be lowercase).

### How this is enforced

- **Your commits:** the `commit-msg` hook rejects a message in the wrong format (turned on by the `git config core.hooksPath` line above). It also runs the secret scan and the tests on every commit. When a commit touches code that can break the app (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `package.json`, the lockfile or `tsconfig.json`), the `pre-commit` hook runs the type check and lint before the tests. On push it runs them again, plus the dependency audit. If the tests fail with ".next is older than app/ sources", run `npx next build --webpack` and commit again.
- **Your PR:** a `check` job on GitHub runs the type check, lint, build, tests and dependency audit, so skipping the local hooks does not skip the checks. A `pr-title` check on GitHub fails if the PR title isn't in this format. Edit the title and it re-runs.

## Versions and the `fix-pr` agent

Every fix or feature raises the `package.json` version, picked from the commit types: breaking (`!`) is a major bump (minor while the version is 0.x), `feat` is minor, `fix`/`perf`/`refactor`/`build` is patch, and docs/test/ci/chore-only changes do not bump. `pnpm release:bump` (`scripts/bump-version.mjs`) works it out and writes it; run it with `--dry` to preview.

In Claude Code, the project agent `fix-pr` (`.claude/agents/fix-pr.md`) does the whole hand-off after a change is written: check, commit, bump, push and open the PR. Nobody needs to push by hand. Only the maintainer merges.

## Publishing

The package is published from GitHub Actions, not from a laptop: the `Publish` workflow (`.github/workflows/publish.yml`) builds, runs the checks and tests, and publishes with [npm provenance](https://docs.npmjs.com/generating-provenance-statements). It stores no npm token. npm trusts the workflow itself ("trusted publishing").

One-time set-up, done by the maintainer:

1. **npmjs.com account:** turn on two-factor authentication.
2. **npmjs.com > the package > Settings > Trusted Publisher:** add GitHub Actions with the owner `karan171996`, the repository `MetricFlow`, the workflow file `publish.yml` and the environment `npm`.
3. **Same page, Publishing access:** choose "Require two-factor authentication and disallow tokens", so nothing but this workflow and a 2FA login can publish.
4. **GitHub > Settings > Environments:** create `npm`, add yourself as a required reviewer, and limit it to the `main` branch.

To release: merge the version bump to `main`, then run **Actions > Publish > Run workflow** on `main`. The run has two jobs. The first builds, tests and packs the tarball; it cannot publish. The second waits for your approval, then publishes that exact tarball and runs nothing else. Approve it once the first job is green.

Before the first release that contains `./browser`, also do the two checks a machine cannot: install the packed tarball into a scratch app outside this repo and build it (no secret name, `axios` or `node:` in its client bundle; no Sentry file requested by a New Relic-only `init`), and start the CLI from that installed copy.

The two browser SDKs (`@sentry/browser`, `@newrelic/browser-agent`) are pinned to exact versions on purpose: the lockfile is not published, so a range would let a consumer install a version nobody here looked at. A security fix in either SDK therefore needs a version bump here and a release; `overrides` in `pnpm-workspace.yaml` do not reach consumers.

**Known advisory.** A consumer's `npm audit` shows one moderate advisory: [GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98) in `fflate` 0.8.2, which comes with `@newrelic/browser-agent` 1.323.0. The affected function (`unzipSync`) belongs to a package that only the agent's session-replay feature imports, and the agent MetricFlow builds does not include that feature, so the code is not in a consumer's bundle. It cannot be fixed from here: the agent pins `fflate` to exactly 0.8.2. Bump the agent pin when New Relic ships one with `fflate` 0.8.3 or later. Do not add an override for it: it would hide the finding here and change nothing for consumers.

## What makes a PR easy to merge

- Don't request a reviewer or assignee when you open the PR. The maintainer picks it up.
- One change per PR. Several unrelated fixes are easier to review as separate PRs.
- Say why, not only what. Link the issue: `Closes #123`.
- Include a screenshot or terminal output for UI or CLI changes.
- Keep CLI output going through `bin/output.mjs` (`out.ok/info/warn/error/kv/spinner`), never `console.log`.
- This project uses a recent Next.js with breaking changes; read `node_modules/next/dist/docs/` before changing framework code.

## Never include secrets or real data

- Don't commit `.env.local`, API keys, tokens, or real New Relic or Sentry numbers. The pre-commit hook blocks most of these, but you are responsible for what you push.
- Screenshots must use sample data. `cypress/e2e/screenshots.cy.ts` generates them with fake numbers.
- Found a security problem? Don't open a public issue; contact the maintainer directly.
