# Developing MetricFlow

[← Back to the README](https://github.com/karan171996/MetricFlow/blob/main/README.md)

Run MetricFlow from source, run its tests, and find your way around the code.


```bash
git clone https://github.com/karan171996/MetricFlow.git
cd MetricFlow
pnpm install
cp .env.local.example .env.local   # then fill in your keys
pnpm dev                           # http://127.0.0.1:3000
```

This repo uses [pnpm](https://pnpm.io) (`corepack enable` picks the pinned version). Install scripts are allowed only for the packages listed in `pnpm-workspace.yaml` (Cypress and `unrs-resolver`).

Run the production build through the CLI:

```bash
pnpm build
node bin/cli.mjs
```

## Tests

```bash
pnpm test              # all tests, fake keys, no network
pnpm test:cli          # node:test suite only
pnpm test:real         # against your real accounts (.env.local)
pnpm cy:run            # Cypress tests (app must be running)
pnpm lint
pnpm send-test-data    # one dummy event to Sentry and New Relic
```

`pnpm test` uses fake keys from `.env.test.example` and never reads `.env.local`. `pnpm test:real` reads `.env.local` and never prints the keys. `send-test-data` needs `SENTRY_DSN` and `NEWRELIC_INSERT_KEY`.

## Project structure

```
app/            Next.js App Router: pages and api/ route handlers
components/     UI, one folder per feature; ui/ is generated shadcn code
lib/            Data fetching (New Relic, Sentry), transforms, hooks
browser/        What a consumer site imports (init, send). Sealed: imports nothing from lib/
bin/            CLI (cli.mjs) and output formatter (output.mjs)
scripts/        send-test-data.mjs, test-env.mjs
test/           node:test suites
cypress/        End-to-end smoke test
docs/images/    README screenshots (not shipped in the npm package)
```


## Contributing


Nobody pushes straight to `main`: fork, branch, and open a pull request. Commit messages and PR titles use the `type(scope): description` format, for example `fix(api): handle an empty New Relic response` or `feat(ui): add a Sentry page`. Types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` and `revert`.

Full steps, the commit format and the PR checklist are in [CONTRIBUTING.md](../CONTRIBUTING.md).
