#!/usr/bin/env bash
# Stop hook: don't let the agent finish while the fast unit tests fail (one extra pass per turn).
# ponytail: runs test:cli only (e2e is too slow per turn); swap in `pnpm test` if you want the full suite.
input=$(cat)
[ "$(jq -r '.stop_hook_active' <<<"$input")" = "true" ] && exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
if ! out=$(env -u ELECTRON_RUN_AS_NODE pnpm run test:cli 2>&1); then
  jq -n --arg log "$(tail -n 40 <<<"$out")" \
    '{decision: "block", reason: ("Tests are failing. Fix them before you stop.\n" + $log)}'
fi
exit 0
