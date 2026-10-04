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
- **Your PR:** a `pr-title` check on GitHub fails if the PR title isn't in this format. Edit the title and it re-runs.

## Versions and the `fix-pr` agent

Every fix or feature raises the `package.json` version, picked from the commit types: breaking (`!`) is a major bump (minor while the version is 0.x), `feat` is minor, `fix`/`perf`/`refactor`/`build` is patch, and docs/test/ci/chore-only changes do not bump. `pnpm release:bump` (`scripts/bump-version.mjs`) works it out and writes it; run it with `--dry` to preview.

In Claude Code, the project agent `fix-pr` (`.claude/agents/fix-pr.md`) does the whole hand-off after a change is written: check, commit, bump, push and open the PR. Nobody needs to push by hand. Only the maintainer merges.

## What makes a PR easy to merge

- One change per PR. Several unrelated fixes are easier to review as separate PRs.
- Say why, not only what. Link the issue: `Closes #123`.
- Include a screenshot or terminal output for UI or CLI changes.
- Keep CLI output going through `bin/output.mjs` (`out.ok/info/warn/error/kv/spinner`), never `console.log`.
- This project uses a recent Next.js with breaking changes; read `node_modules/next/dist/docs/` before changing framework code.

## Never include secrets or real data

- Don't commit `.env.local`, API keys, tokens, or real New Relic or Sentry numbers. The pre-commit hook blocks most of these, but you are responsible for what you push.
- Screenshots must use sample data. `cypress/e2e/screenshots.cy.ts` generates them with fake numbers.
- Found a security problem? Don't open a public issue; contact the maintainer directly.
