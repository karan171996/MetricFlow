---
title: CLI reference
nav_order: 6
---

# CLI reference

[MetricFlow on GitHub](https://github.com/karan171996/MetricFlow)

Every option of the `performance-dashboard` command.


```
performance-dashboard [port] [options]
```

| Option | Description |
| --- | --- |
| `-h`, `--help` | Show help |
| `-v`, `--version` | Print the version |
| `--json` | Machine-readable output: one JSON object per line on stdout (`event` is `ok`, `info`, `warn`, `error` or `summary`) |
| `--no-color` | Disable colors (also honors `NO_COLOR` and non-TTY output) |
| `--no-open` | Start the server without opening a browser |
| `--host <addr>` | Address to listen on. Default `127.0.0.1` (this machine only). `--host 0.0.0.0` exposes the dashboard, and the New Relic/Sentry data behind it, to your network and prints a warning |
| `[port]` | Port to listen on; default `3000`. The `PORT` environment variable also works |

The CLI loads `.env.local` and `.env` from the folder you run it in. Set `METRICFLOW_PROJECT_NAME` to change the name shown in the dashboard header.

Examples:

```bash
performance-dashboard
performance-dashboard 4000 --no-color
performance-dashboard --json
```

JSON output:

```
{"event":"ok","message":"Dashboard is running","url":"http://localhost:3000","port":3000}
```

Errors print what failed and how to fix it. Exit code `2` is bad usage, `1` is a runtime failure:

```
$ performance-dashboard abc
✖ Invalid port "abc".
  → Use a number from 1 to 65535, e.g. performance-dashboard 4000
```

Human text goes to stdout; errors, warnings and spinners go to stderr. Full spec: [CLI_OUTPUT.md](https://github.com/karan171996/MetricFlow/blob/main/CLI_OUTPUT.md).

---

Next: [Configuration](configuration.md)
