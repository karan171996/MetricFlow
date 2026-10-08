import { createHash } from 'node:crypto';

export interface DiscoveredPage {
  /** Normalized path, no host, query or hash. Used to match New Relic `page` and Sentry `url`. */
  url: string;
  slug: string;
  name: string;
  /** Page views in the discovery window (all query-string variants merged). */
  views: number;
}

export const MAX_PAGES = 20;

/** NRQL clause: only page loads from a local dev server, so prod/staging data in the same account is ignored. */
export const LOCAL_ONLY_NRQL = `WHERE (pageUrl LIKE 'http%://localhost%' OR pageUrl LIKE 'http%://127.0.0.1%')`;

/** True for a page served from this machine: the same pages LOCAL_ONLY_NRQL keeps. */
export function isLocalUrl(raw: string): boolean {
  try {
    return ['localhost', '127.0.0.1'].includes(new URL(raw).hostname);
  } catch {
    return false;
  }
}

/** "https://site.com/Blog/?utm=1#x" -> "/blog"; "/" stays "/". Returns null if unusable. */
export function normalizePath(raw: string): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let path: string;
  try {
    path = new URL(raw, 'http://placeholder').pathname;
  } catch {
    return null;
  }
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep the encoded form if it is not valid UTF-8
  }
  path = path.toLowerCase().replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path.startsWith('/') ? path : null;
}

/**
 * Slug rule: "/" -> "home"; otherwise the path lowercased with every run of
 * characters outside a-z0-9 turned into "-", trimmed, max 60 chars
 * ("/blog/My Post" -> "blog-my-post"). Paths that reduce to the same slug all
 * get a 6-char hash of their path appended, so slugs are unique and stable.
 */
export function baseSlug(path: string): string {
  if (path === '/') return 'home';
  return path.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'page';
}

/** "/" -> "Homepage"; "/blog/my-post" -> "Blog / My Post". */
export function pageName(path: string): string {
  if (path === '/') return 'Homepage';
  return path
    .split('/')
    .filter(Boolean)
    .map(seg => seg.replace(/[-_]+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase()) || seg)
    .join(' / ');
}

export function buildPages(rows: { url: string; views: number }[]): DiscoveredPage[] {
  const byPath = new Map<string, number>();
  for (const { url, views } of rows) {
    const path = normalizePath(url);
    if (path === null) continue;
    byPath.set(path, (byPath.get(path) ?? 0) + (Number.isFinite(views) ? views : 0));
  }

  const sorted = [...byPath].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, MAX_PAGES);

  const counts = new Map<string, number>();
  for (const [path] of sorted) counts.set(baseSlug(path), (counts.get(baseSlug(path)) ?? 0) + 1);

  return sorted.map(([path, views]) => {
    const base = baseSlug(path);
    const slug = counts.get(base)! > 1 ? `${base}-${createHash('sha1').update(path).digest('hex').slice(0, 6)}` : base;
    return { url: path, slug, name: pageName(path), views };
  });
}
