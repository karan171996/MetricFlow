# CLI output spec

Code: `bin/output.mjs` (formatter, no dependencies). `bin/cli.mjs` holds the command logic and calls it.

## Rules
- Human text goes to **stdout**. Errors, warnings and spinners go to **stderr**.
- Status symbols: `✔` ok (green), `ℹ` info (cyan), `⚠` warn (yellow), `✖` error (red). ASCII fallback (`ok ! x i`) on legacy Windows consoles.
- Errors: one bold line saying what failed, then `→` and how to fix it. Exit codes: `2` bad usage, `1` runtime failure.
- Color precedence, first match wins: `--no-color` / `--json` / `NO_COLOR` (non-empty) → off; `FORCE_COLOR` (not `0`) → on, even if `TERM=dumb` or piped; `FORCE_COLOR=0` → off; `TERM=dumb` or non-TTY → off; otherwise TTY → on.
- The spinner shows only on a color-capable TTY; otherwise one plain line (`Starting dashboard on port 3000...`).
- `--json`: one JSON object per line on stdout, always with `event` (`ok`, `info`, `warn`, `error`, `summary`). Next.js's own logs are sent to stderr so stdout stays parseable.

## Flags
`-h/--help`, `-v/--version`, `--json`, `--no-color`, `--host <addr>` (default `127.0.0.1`; non-loopback prints two `warn` lines (network exposure; /setup and /connect disabled) and sets `METRICFLOW_EXPOSED=1` for the server / `{"event":"warn","host":...}`), optional `[port]` (or `PORT` env).

## Examples
`performance-dashboard` (TTY, spinner replaced when ready):
```
✔ Dashboard is running
  URL   http://localhost:3000
  Stop  Ctrl+C
```
Piped / `--no-color`:
```
Starting dashboard on port 3000...
✔ Dashboard is running
  URL   http://localhost:3000
  Stop  Ctrl+C
```
`performance-dashboard --json`:
```
{"event":"ok","message":"Dashboard is running","url":"http://localhost:3000","port":3000}
```
No build:
```
✖ No build found.
  → Run `npm run build` first (published packages include it).
```
Bad port (exit 2): `performance-dashboard abc`
```
✖ Invalid port "abc".
  → Use a number from 1 to 65535, e.g. performance-dashboard 4000
```
Server failed (exit = server's code), `--json`:
```
{"event":"error","code":"server_exit","message":"Server exited with code 1.","hint":"Check the output above; the port may be in use (try another port)."}
```
`--help` and `--version` print usage and the bare version number (see `helpText` in `bin/output.mjs`).

## Adding a command
Call `out.ok/info/warn/error/kv/spinner` with a `code` and data object. Never `console.log` directly.

## Not verified
Starting the server in a real run: the sandbox blocks port binding. `--help`, `--version`, `--json` and the error paths were run.
