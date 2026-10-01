#!/bin/sh
# Commit guard: no real key can reach a commit. Output never contains secret values.
cd "$(git rev-parse --show-toplevel)" || exit 1
staged=$(git diff --cached --name-only --diff-filter=ACMR)

# 1. env files: only the placeholder templates may be committed
bad=$(echo "$staged" | grep -E '(^|/)\.env($|\.)|\.pem$|\.p12$|id_rsa' | grep -v -E '(^|/)\.env\.(local|test)\.example$|(^|/)\.env\.(example|sample)$')
if [ -n "$bad" ]; then printf 'BLOCKED: secret-bearing file staged:\n%s\n' "$bad"; exit 1; fi

# 2. test output / captures can hold real data
out=$(echo "$staged" | grep -E '(^|/)(cypress/(screenshots|videos|downloads)|test-results|playwright-report|coverage)/')
if [ -n "$out" ]; then printf 'BLOCKED: test output staged (may contain real data):\n%s\n' "$out"; exit 1; fi

# 3. any actual value from the local .env.local (names only in the message)
node "$(dirname "$0")/guard-env-values.mjs" staged || exit 1

# 4. key-shaped strings; FAKE-* placeholders are allowed
hits=$(git diff --cached -U0 --no-color | grep -E '^\+' | grep -v '^+++' | sed -E 's/FAKE-[A-Za-z0-9_-]*//g' | grep -n -E \
 'sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{10,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|NRAK-[A-Z0-9]{20,}|NRJS-[a-f0-9]{15,}|sntry[su]_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|(api[_-]?key|secret|token|password)["'"'"' ]*[:=]["'"'"' ]*[A-Za-z0-9_\-]{24,}')
if [ -n "$hits" ]; then echo "BLOCKED: possible token/secret in staged changes (line numbers are of the filtered diff):"; echo "$hits" | cut -c1-80 | sed 's/[A-Za-z0-9_-]\{24,\}/<redacted>/g'; exit 1; fi
exit 0
