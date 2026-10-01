---
name: test:cli
description: Run CLI tests and validate output spec
trigger: "/cli-test"
---

Run the CLI test suite to validate output formatting, port handling, and error messages against spec (CLI_OUTPUT.md).

## Run

```bash
npm run test:cli
```

## What it tests

- Help (`-h/--help`) and version (`-v/--version`) output
- Port validation (bad port → exit 2 with hint)
- Error/warning/info formatting and exit codes
- Output color behavior (TTY, NO_COLOR, FORCE_COLOR)
- `--json` mode (NDJSON, no color, proper events)
- No build detection and error hints
- Real server start (requires built `.next/`)

## Fast mode

For quick validation during development:

```bash
node --test test/cli.test.mjs --test-name-pattern="help|version|bad port"
```
