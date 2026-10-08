import axios from 'axios';

export type ParsedDsn = { projectId: string; orgId: string | null; apiBase: string };
export type ParseResult = ({ ok: true } & ParsedDsn) | { ok: false; error: string };

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** DSN is ingest-only. Project id is the path; `o<id>.ingest.<host>` carries the org id and API host. */
export function parseSentryDsn(raw: string): ParseResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: 'Sentry DSN is not a valid URL.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, error: 'Sentry DSN must be an http(s) URL.' };
  // A legacy DSN carries a secret key after the public one. It must never be saved (nor shown on /connect).
  if (url.password) return { ok: false, error: 'This is a legacy DSN that contains a secret key. Copy the DSN from Project settings > Client Keys.' };
  // The Sentry token is sent to the DSN's host, so plain http is only fine for a dev server on this machine.
  if (url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname)) return { ok: false, error: 'Sentry DSN must use https (http is only accepted for localhost).' };
  if (!url.username) return { ok: false, error: 'Sentry DSN is missing its public key.' };
  const projectId = url.pathname.replace(/^\/|\/$/g, '');
  if (!/^\d+$/.test(projectId)) return { ok: false, error: 'Sentry DSN is missing a numeric project id.' };
  const org = url.host.match(/^o(\d+)\.ingest\.(.+)$/i);
  const apiHost = org ? org[2] : url.host;
  return { ok: true, projectId, orgId: org ? org[1] : null, apiBase: `${url.protocol}//${apiHost}/api/0` };
}

/** The DSN as safe to show: `protocol//publicKey@host/projectId`. Never the raw value; null when it does not parse. */
export function publicDsn(raw: string): string | null {
  const parsed = parseSentryDsn(raw);
  if (!parsed.ok) return null;
  const url = new URL(raw);
  return `${url.protocol}//${url.username}@${url.host}/${parsed.projectId}`;
}

/** A notice (not a refusal: self-hosted Sentry is legitimate) when the token would go to a host that is not sentry.io or a subdomain. */
export function sentryHostNotice(apiBase: string): string | null {
  const host = new URL(apiBase).hostname;
  if (host === 'sentry.io' || host.endsWith('.sentry.io')) return null;
  return `Your Sentry token will be sent to ${host}, which is not sentry.io. Continue only if that is your own Sentry server.`;
}

type OrgRow = { id?: string | number; slug?: string; organization?: { slug?: string } };

/** Sentry's events URL needs an org slug. Look it up and forget it — never stored. */
export async function orgSlugForDsn(token: string, parsed: ParsedDsn): Promise<string | null> {
  const headers = { Authorization: `Bearer ${token}` };
  const list = parsed.orgId
    ? await axios.get(`${parsed.apiBase}/organizations/`, { headers, timeout: 8000 })
    : await axios.get(`${parsed.apiBase}/projects/`, { headers, timeout: 8000 });
  const rows: OrgRow[] = Array.isArray(list.data) ? list.data : [];
  const slug = parsed.orgId
    ? rows.find(o => String(o.id) === parsed.orgId)?.slug
    : rows.find(p => String(p.id) === parsed.projectId)?.organization?.slug;
  return slug ?? null;
}
