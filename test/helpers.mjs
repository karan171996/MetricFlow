import { mock } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const root = resolve(import.meta.dirname, "..");
export const load = (rel) => import(pathToFileURL(join(root, rel)).href);
export const tmpEnvFile = () => join(mkdtempSync(join(tmpdir(), "mf-env-")), ".env.local");

/**
 * process.env minus the GIT_* vars. Hooks run with GIT_INDEX_FILE/GIT_DIR set,
 * and a throwaway repo that inherits them runs `git add` against the real
 * repo's index - which wipes it. Tests that shell out to git must use this.
 */
export const gitlessEnv = (extra = {}) => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))),
  ...extra,
});

// Fake keys only. Marked so a leak is greppable.
export const FAKE = {
  NEWRELIC_API_KEY: "FAKE-NRAK-0000", NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID: "1234567",
  SENTRY_API_KEY: "FAKE-SENTRY-0000", SENTRY_DSN: "https://public@o123.ingest.sentry.io/456",
};

/** Replace axios for modules loaded after this call. `handler(method, url, body)` returns {data} or throws {response:{status}}. */
export function mockAxios(handler) {
  const calls = [];
  const fn = (method) => async (url, a, b) => {
    calls.push({ method, url, a, b });
    return handler(method, url, calls.at(-1));
  };
  const axios = { post: fn("post"), get: fn("get"), isAxiosError: (e) => Boolean(e?.isAxiosError) };
  mock.module("axios", { defaultExport: axios });
  return calls;
}
export const httpError = (status) => Object.assign(new Error("FAKE http error carrying " + FAKE.NEWRELIC_API_KEY), { isAxiosError: true, response: { status } });

export const req = (url, { method = "GET", headers = {}, body } = {}) =>
  new Request(url, { method, headers: { host: "localhost:3000", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
