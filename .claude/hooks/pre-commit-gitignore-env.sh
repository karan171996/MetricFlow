#!/bin/bash
# Verify .env.local is in .gitignore before committing.
# Runs as a PreToolUse hook on git commit only.

# Read tool call from stdin
input=$(cat)

# Extract the command (Claude Code sends .tool_input.command)
command=$(echo "$input" | jq -r '.tool_input.command' 2>/dev/null)

# Only validate on git commit
if [[ ! "$command" =~ git.*commit ]]; then
  exit 0
fi

# Check .gitignore exists
if [[ ! -f .gitignore ]]; then
  echo "⚠ .gitignore not found" >&2
  echo "→ Commit allowed; please create .gitignore and add .env.local" >&2
  exit 0
fi

# Check .env.local is in .gitignore
if ! grep -q '\.env\.local' .gitignore; then
  echo "✖ .env.local not in .gitignore" >&2
  echo "→ Add .env.local to .gitignore to prevent committing local credentials" >&2
  exit 2
fi

echo "✔ .env.local is in .gitignore" >&2
exit 0
