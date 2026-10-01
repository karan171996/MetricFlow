#!/bin/sh
# Hooks run the fast, offline node suite (fake keys only; test/live/ is excluded by the glob).
# The slower e2e/real suites (test:basic cypress part, test:real) are not run by git hooks.
cd "$(git rev-parse --show-toplevel)" || exit 1
npm run -s test:cli || { echo "BLOCKED: tests failed (test:cli)"; exit 1; }
