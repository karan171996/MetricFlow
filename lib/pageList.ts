import 'server-only';
import { SERVER_TOOLS } from '@/lib/analytics';
import { buildPages } from '@/lib/discoverPages';
import { connectedTools } from '@/lib/env';
import { sourcesFor } from '@/lib/tools';

/**
 * Slugs of the pages listed right now, for the detail page's "does this slug exist" check.
 * `null` when no connected tool lists pages or the lookup failed: the caller then lets the client show its own state.
 */
export async function listedSlugs(): Promise<string[] | null> {
  const id = sourcesFor(connectedTools()).pages;
  if (!id) return null;
  const read = await SERVER_TOOLS[id].poll().catch(() => null);
  return read && buildPages(read.pages ?? []).map(p => p.slug);
}
