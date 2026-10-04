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
export async function newRelicStatus(apiKey: string, accountId: string, eventType: 'MetricFlowEvent' | 'PageView'): Promise<SourceStatus> {
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
