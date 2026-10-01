#!/bin/sh
# Blocks staged .env/key files and token-looking strings in staged additions.
bad=$(git diff --cached --name-only --diff-filter=ACM | grep -E '(^|/)\.env($|\.)|\.pem$|\.p12$|id_rsa' | grep -v -E '\.env(\.local)?\.(example|sample)$')
if [ -n "$bad" ]; then echo "BLOCKED: secret-bearing file staged:\n$bad"; exit 1; fi
hits=$(git diff --cached -U0 --no-color | grep -E '^\+' | grep -v '^+++' | grep -n -E \
 'sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{10,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|NRAK-[A-Z0-9]{20,}|NRJS-[a-f0-9]{15,}|sntry[su]_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|(api[_-]?key|secret|token|password)["'"'"' ]*[:=]["'"'"' ]*[A-Za-z0-9_\-]{24,}')
if [ -n "$hits" ]; then echo "BLOCKED: possible token/secret in staged changes (line numbers are of the filtered diff):"; echo "$hits" | cut -c1-80 | sed 's/[A-Za-z0-9_-]\{24,\}/<redacted>/g'; exit 1; fi
