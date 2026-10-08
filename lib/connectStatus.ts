import axios from 'axios';
import { nrGraphql, withRegion } from '@/lib/nrRequest';
import { orgSlugForDsn, parseSentryDsn } from '@/lib/sentryDsn';

export interface SourceStatus {
  /** Events seen in the last 5 minutes, or null if the source could not be read. */
  recent: number | null;
  /** ISO time of the most recent event, or null if none. */
  lastEventAt: string | null;
  error?: string;
}

async function nrql(apiKey: string, accountId: string, query: string): Promise<Record<string, unknown>> {
  const gql = `{ actor { account(id: ${Number(accountId)}) { nrql(query: "${query}") { results } } } }`;
  const body = await nrGraphql<{ data?: { actor?: { account?: { nrql?: { results?: Record<string, unknown>[] } } } } }>(apiKey, gql, 8000);
  const row = body?.data?.actor?.account?.nrql?.results?.[0];
  if (!row) throw new Error('no result');
  return row;
}

/** Events sent with emitMetric()/the test button, or the browser agent's PageView events. */
export async function newRelicStatus(apiKey: string, accountId: string, eventType: 'MetricFlowEvent' | 'PageView' | 'AjaxRequest'): Promise<SourceStatus> {
  try {
    const row = await nrql(apiKey, accountId, `SELECT count(*) AS n, latest(timestamp) AS t FROM ${eventType} SINCE 5 minutes ago`);
    const n = Number(row.n ?? 0);
    return { recent: n, lastEventAt: n > 0 && row.t ? new Date(Number(row.t)).toISOString() : null };
  } catch {
    return { recent: null, lastEventAt: null, error: 'Could not read from New Relic.' };
  }
}

export async function sentryStatus(token: string, dsn: string): Promise<SourceStatus> {
  const parsed = parseSentryDsn(dsn);
  if (!parsed.ok) return { recent: null, lastEventAt: null, error: 'Could not read from Sentry.' };
  try {
    const slug = await orgSlugForDsn(token, parsed);
    if (!slug) return { recent: null, lastEventAt: null, error: 'Could not read from Sentry.' };
    const res = await axios.get(
      `${parsed.apiBase}/organizations/${encodeURIComponent(slug)}/issues/`,
      { headers: { Authorization: `Bearer ${token}` }, params: { project: parsed.projectId, sort: 'date', limit: 1, statsPeriod: '24h' }, timeout: 8000 }
    );
    const last: string | undefined = res.data?.[0]?.lastSeen;
    const recent = last && Date.now() - new Date(last).getTime() < 5 * 60_000 ? 1 : 0;
    return { recent, lastEventAt: last ?? null };
  } catch {
    return { recent: null, lastEventAt: null, error: 'Could not read from Sentry.' };
  }
}

/** Sends one test event through New Relic's Event API. Returns an error message, or null on success. */
export async function sendTestEvent(insertKey: string, accountId: string): Promise<string | null> {
  try {
    const res = await withRegion(h =>
      axios.post(
        `${h.ingest}/v1/accounts/${Number(accountId)}/events`,
        [{ eventType: 'MetricFlowEvent', name: 'test', value: 1, source: 'connect-page' }],
        { headers: { 'Api-Key': insertKey }, timeout: 8000 }
      )
    );
    return res.data?.success === true ? null : 'New Relic did not accept the event.';
  } catch (e) {
    const status = axios.isAxiosError(e) ? e.response?.status : undefined;
    if (status === 401 || status === 403) return 'New Relic rejected the Insert key. It must be an "Ingest - License" key for this account.';
    if (status === 404) return 'New Relic did not recognise the account ID.';
    return 'Could not reach New Relic to send the test event.';
  }
}

export interface BrowserSetup {
  /** Browser apps in the account. 0 = none created yet, which is the usual blocker. */
  appCount: number;
  appName: string | null;
  /** Paste-ready value for NEXT_PUBLIC_NEWRELIC_APP_ID. Not the account ID. */
  applicationId: string | null;
  /** The account's "Ingest - Browser" key. Public by design: it ships in the page's JS. */
  browserKey: string | null;
  error?: string;
}

/**
 * Looks up what the browser snippet needs, so the user never has to find it.
 * New Relic's key list shows an ID next to each key; pasting that ID instead of
 * the key value fails silently (the beacon 403s and nothing is logged), so we
 * read the real values with the User key the dashboard already has.
 */
export async function browserSetup(apiKey: string, accountId: string): Promise<BrowserSetup> {
  const empty: BrowserSetup = { appCount: 0, appName: null, applicationId: null, browserKey: null };
  const id = Number(accountId);
  const gql = `{ actor {
    entitySearch(query: "domain='BROWSER' AND accountId=${id}") { count results { entities { name ... on BrowserApplicationEntityOutline { applicationId } } } }
    apiAccess { keySearch(query: { types: INGEST, scope: { accountIds: [${id}] } }) { keys { ... on ApiAccessIngestKey { ingestType key } } } }
  } }`;
  try {
    type Body = {
      data?: { actor?: {
        entitySearch?: { count?: number; results?: { entities?: { name?: string; applicationId?: number }[] } };
        apiAccess?: { keySearch?: { keys?: { ingestType?: string; key?: string }[] } };
      } };
    };
    const body = await nrGraphql<Body>(apiKey, gql, 10000);
    const search = body?.data?.actor?.entitySearch;
    const app = search?.results?.entities?.[0];
    // keySearch needs extra permissions; a key without them still gives us the app.
    const found = body?.data?.actor?.apiAccess?.keySearch?.keys?.find(k => k.ingestType === 'BROWSER')?.key;
    // This value is pre-filled into a snippet for a public page, so pass on nothing that is not a browser key.
    const browserKey = found && /^NRJS-[a-z0-9]+$/i.test(found) ? found : null;
    return {
      appCount: search?.count ?? 0,
      appName: app?.name ?? null,
      applicationId: app?.applicationId ? String(app.applicationId) : null,
      browserKey
    };
  } catch {
    return { ...empty, error: 'Could not read your Browser app from New Relic.' };
  }
}
