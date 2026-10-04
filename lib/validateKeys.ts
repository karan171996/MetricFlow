import axios from 'axios';
import { nrHosts, type NrRegion, type SetupKey } from '@/lib/env';
import { orgSlugForDsn, parseSentryDsn } from '@/lib/sentryDsn';

export type KeyResult = { ok: true; region?: NrRegion } | { ok: false; error: string };
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
    const ask = (region: NrRegion) =>
      axios.post(
        nrHosts(region).graphql,
        { query: `{ actor { user { id } account(id: ${accountId}) { id } } }` },
        { headers: { 'API-Key': key }, timeout: 8000 }
      );
    // A key only works on its own data centre: try US, and if it is rejected there, EU.
    let region: NrRegion = 'us';
    let res;
    try {
      res = await ask('us');
      if (!res.data?.data?.actor?.user?.id) throw new Error('rejected');
    } catch (usError) {
      try {
        res = await ask('eu');
        if (!res.data?.data?.actor?.user?.id) throw usError;
        region = 'eu';
      } catch {
        throw usError;
      }
    }
    const regionTag = region === 'eu' ? { region } : {};
    const actor = res.data?.data?.actor;
    if (!actor?.user?.id) return { NEWRELIC_API_KEY: { ok: false, error: 'New Relic User key was rejected.' } };
    if (!actor.account?.id) {
      return {
        NEWRELIC_API_KEY: { ok: true, ...regionTag },
        NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID: { ok: false, error: 'This key cannot see that account ID.' }
      };
    }
    return { NEWRELIC_API_KEY: { ok: true, ...regionTag }, NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID: { ok: true } };
  } catch (e) {
    return { NEWRELIC_API_KEY: { ok: false, error: describe(e, 'New Relic') } };
  }
}

async function checkSentry(token: string, dsn: string): Promise<Record<string, KeyResult>> {
  const parsed = parseSentryDsn(dsn);
  if (!parsed.ok) return { SENTRY_DSN: { ok: false, error: parsed.error } };
  try {
    const slug = await orgSlugForDsn(token, parsed);
    if (!slug) return { SENTRY_API_KEY: { ok: true }, SENTRY_DSN: { ok: false, error: 'This DSN does not match a project the token can read.' } };
    return { SENTRY_API_KEY: { ok: true }, SENTRY_DSN: { ok: true } };
  } catch (e) {
    return { SENTRY_API_KEY: { ok: false, error: describe(e, 'Sentry token') } };
  }
}

/** One read call per source; returns a pass/fail per field, never the values. */
export async function validateKeys(input: SetupInput): Promise<Record<string, KeyResult>> {
  const [nr, sentry] = await Promise.all([
    checkNewRelic(input.NEWRELIC_API_KEY, input.NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID),
    checkSentry(input.SENTRY_API_KEY, input.SENTRY_DSN)
  ]);
  return { ...nr, ...sentry };
}
