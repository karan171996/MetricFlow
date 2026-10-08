import { discoverPages } from '@/lib/newrelic';
import { env, isToolConnected } from '@/lib/env';

/**
 * Slugs of the pages listed right now, for the detail page's "does this slug exist" check.
 * `null` when no connected tool lists pages or the lookup failed: the caller then lets the client show its own state.
 */
export async function listedSlugs(): Promise<string[] | null> {
  if (!isToolConnected('new-relic')) return null;
  const pages = await discoverPages(env('NEWRELIC_API_KEY'), env('NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID')).catch(() => null);
  return pages && pages.map(p => p.slug);
}
