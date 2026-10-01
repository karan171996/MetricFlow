#!/bin/bash
# Validate npm package integrity before git commit.
# Runs as a PreToolUse hook: reads bash tool-call JSON from stdin.
# Blocks (exit 2) only on git commit; passes through (exit 0) for other commands.

# Read tool call from stdin
input=$(cat)

# Extract the command from the JSON payload (Claude Code sends .tool_input.command)
command=$(echo "$input" | jq -r '.tool_input.command' 2>/dev/null)

# Only validate on git commit
if [[ ! "$command" =~ git.*commit ]]; then
  exit 0
fi

# Validate npm package integrity
echo "Validating npm package before commit..." >&2
output=$(npm pack --dry-run --json --ignore-scripts 2>&1)
if [[ $? -ne 0 ]]; then
  # npm pack failed; warn but don't block
  firstline=$(echo "$output" | head -1)
  echo "⚠ npm pack failed: $firstline" >&2
  echo "→ Commit allowed; fix the npm issue before publishing" >&2
  exit 0
fi

# Parse the output (should be valid JSON)
json=$(echo "$output" | jq '.' 2>/dev/null)
if [[ -z "$json" ]]; then
  echo "⚠ npm pack output is not valid JSON" >&2
  echo "→ Commit allowed; check npm pack output before publishing" >&2
  exit 0
fi

files=$(echo "$json" | jq -r '.[0].files[].path' 2>/dev/null || echo "")
if [[ -z "$files" ]]; then
  # No files extracted; this is a tooling issue, not a real error
  echo "⚠ Could not extract file list from npm pack" >&2
  echo "→ Commit allowed; check npm before publishing" >&2
  exit 0
fi

# Check required files are included
if ! echo "$files" | grep -q "^bin/cli.mjs$"; then
  echo "✖ bin/cli.mjs missing from npm package" >&2
  echo "→ Check that bin/ is in package.json \"files\" array" >&2
  exit 2
fi

# Check excluded files are not included
if echo "$files" | grep -q "^\.next/dev/\|^\.next/cache/"; then
  echo "✖ .next/dev or .next/cache leaked into npm package" >&2
  echo "→ Verify .next/ exclusions in package.json \"files\" array" >&2
  exit 2
fi

echo "✔ Package validation passed" >&2
exit 0
