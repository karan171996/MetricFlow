import axios from 'axios';
import type { SetupKey } from '@/lib/env';

export type KeyResult = { ok: true } | { ok: false; error: string };
export type SetupInput = Record<SetupKey, string>;

// Never include the thrown axios error: its config carries the key in headers.
function describe(e: unknown, what: string): string {
  const status = axios.isAxiosError(e) ? e.response?.status : undefined;
  if (status === 401 || status === 403) return `${what} was rejected (check the key and its permissions).`;
  if (status === 404) return `${what} was not found.`;
  return `Could not reach ${what} to check it.`;
}

async function checkNewRelic(key: string, accountId: string): Promise<Record<string, KeyResult>> {
  if (!/^\d+$/.test(accountId)) {
    return { NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID: { ok: false, error: 'Account ID must be a number.' } };
  }
  try {
    const res = await axios.post(
      'https://api.newrelic.com/graphql',
      { query: `{ actor { user { id } account(id: ${accountId}) { id } } }` },
      { headers: { 'API-Key': key }, timeout: 8000 }
    );
    const actor = res.data?.data?.actor;
    if (!actor?.user?.id) return { NEWRELIC_API_KEY: { ok: false, error: 'New Relic User key was rejected.' } };
    if (!actor.account?.id) {
      return {
        NEWRELIC_API_KEY: { ok: true },
        NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID: { ok: false, error: 'This key cannot see that account ID.' }
      };
    }
    return { NEWRELIC_API_KEY: { ok: true }, NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID: { ok: true } };
  } catch (e) {
    return { NEWRELIC_API_KEY: { ok: false, error: describe(e, 'New Relic') } };
  }
}

async function checkSentry(token: string, org: string, project: string): Promise<Record<string, KeyResult>> {
  const headers = { Authorization: `Bearer ${token}` };
  const base = `https://sentry.io/api/0`;
  try {
    await axios.get(`${base}/organizations/${encodeURIComponent(org)}/`, { headers, timeout: 8000 });
  } catch (e) {
    const status = axios.isAxiosError(e) ? e.response?.status : undefined;
    return status === 404
      ? { SENTRY_ORG_SLUG: { ok: false, error: 'Sentry organization slug was not found.' } }
      : { SENTRY_API_KEY: { ok: false, error: describe(e, 'Sentry token') } };
  }
  try {
    await axios.get(`${base}/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/`, { headers, timeout: 8000 });
  } catch (e) {
    return { SENTRY_API_KEY: { ok: true }, SENTRY_ORG_SLUG: { ok: true }, SENTRY_PROJECT_ID: { ok: false, error: describe(e, 'Sentry project') } };
  }
  return { SENTRY_API_KEY: { ok: true }, SENTRY_ORG_SLUG: { ok: true }, SENTRY_PROJECT_ID: { ok: true } };
}

/** One read call per source; returns a pass/fail per field, never the values. */
export async function validateKeys(input: SetupInput): Promise<Record<string, KeyResult>> {
  const [nr, sentry] = await Promise.all([
    checkNewRelic(input.NEWRELIC_API_KEY, input.NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID),
    checkSentry(input.SENTRY_API_KEY, input.SENTRY_ORG_SLUG, input.SENTRY_PROJECT_ID)
  ]);
  return { ...nr, ...sentry };
}
