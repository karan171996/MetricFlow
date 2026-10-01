#!/bin/bash
# Scan code for key/secret logging patterns and secrets in test fixtures.
# Runs as a PreToolUse hook on git commit only.

# Read tool call from stdin
input=$(cat)

# Extract the command (Claude Code sends .tool_input.command)
command=$(echo "$input" | jq -r '.tool_input.command' 2>/dev/null)

# Only validate on git commit
if [[ ! "$command" =~ git.*commit ]]; then
  exit 0
fi

# Get the list of staged files
staged_files=$(git diff --cached --name-only 2>/dev/null || echo "")

if [[ -z "$staged_files" ]]; then
  exit 0
fi

# Pattern 1: console.log/logger with key/secret/token/password
# Catch patterns like: console.log(apiKey), logger.info(secret), etc.
echo "$staged_files" | while read -r file; do
  if git show ":$file" 2>/dev/null | grep -qE '(console\.(log|error|warn)|logger\.(info|debug|warn|error))\s*\([^)]*\b(key|secret|token|password|apiKey|API_KEY|SENTRY|NEWRELIC)[^)]*\)'; then
    echo "✖ Possible key/secret logged in $file" >&2
    echo "→ Remove or mask sensitive data before committing" >&2
    exit 2
  fi
done

# Check for exit code from while loop
if [[ $? -ne 0 ]]; then
  exit 2
fi

# Pattern 2: Hardcoded New Relic / Sentry API keys in test fixtures
# Common patterns: "nr_", "nreum", "sentry_" in strings
for testfile in $(echo "$staged_files" | grep -E '\.(test|spec)\.(ts|tsx|js)$'); do
  if git show ":$testfile" 2>/dev/null | grep -qE '(nr_[a-zA-Z0-9]{20,}|nreum-[a-zA-Z0-9]+|sentry_[a-zA-Z0-9]{20,}|https://[a-z0-9]+@o[0-9]+\.ingest\.sentry\.io)'; then
    echo "✖ Possible API key in test fixture: $testfile" >&2
    echo "→ Use placeholder or environment variable instead of real keys" >&2
    exit 2
  fi
done

echo "✔ No secrets detected in logging or fixtures" >&2
exit 0
