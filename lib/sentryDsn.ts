import axios from 'axios';

export type ParsedDsn = { projectId: string; orgId: string | null; apiBase: string };
export type ParseResult = ({ ok: true } & ParsedDsn) | { ok: false; error: string };

/** DSN is ingest-only. Project id is the path; `o<id>.ingest.<host>` carries the org id and API host. */
export function parseSentryDsn(raw: string): ParseResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: 'Sentry DSN is not a valid URL.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, error: 'Sentry DSN must be an http(s) URL.' };
  if (!url.username) return { ok: false, error: 'Sentry DSN is missing its public key.' };
  const projectId = url.pathname.replace(/^\/|\/$/g, '');
  if (!/^\d+$/.test(projectId)) return { ok: false, error: 'Sentry DSN is missing a numeric project id.' };
  const org = url.host.match(/^o(\d+)\.ingest\.(.+)$/i);
  const apiHost = org ? org[2] : url.host;
  return { ok: true, projectId, orgId: org ? org[1] : null, apiBase: `${url.protocol}//${apiHost}/api/0` };
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
