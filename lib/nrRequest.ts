import axios from 'axios';
import { REGION_KEY, nrHosts } from '@/lib/env';

type Hosts = ReturnType<typeof nrHosts>;

/**
 * Runs `call` against the configured region. With no NEWRELIC_REGION set (env stored
 * elsewhere, never ran /setup) it tries US, and if the key is rejected there, EU,
 * remembering EU in process.env for the rest of this server's life.
 */
export async function withRegion<T>(call: (h: Hosts) => Promise<T>, rejected: (r: T) => boolean = () => false): Promise<T> {
  if (process.env[REGION_KEY]) return call(nrHosts());

  let usResult: T | undefined;
  let usError: unknown;
  try {
    usResult = await call(nrHosts('us'));
    if (!rejected(usResult)) return usResult;
  } catch (e) {
    const status = axios.isAxiosError(e) ? e.response?.status : undefined;
    if (status !== 401 && status !== 403) throw e;
    usError = e;
  }
  try {
    const eu = await call(nrHosts('eu'));
    if (!rejected(eu)) {
      process.env[REGION_KEY] = 'eu';
      return eu;
    }
  } catch {
    // fall through to the US outcome: that is the error the user should see
  }
  if (usError) throw usError;
  return usResult as T;
}

type GqlResponse = { data?: { data?: { actor?: unknown } } };

/** POSTs a GraphQL query to the right region and returns the response body. */
export async function nrGraphql<R = unknown>(apiKey: string, query: string, timeout: number): Promise<R> {
  const res = await withRegion(
    h => axios.post(h.graphql, { query }, { headers: { 'API-Key': apiKey, 'Content-Type': 'application/json' }, timeout }),
    (r: GqlResponse) => !r.data?.data?.actor
  );
  return res.data as R;
}
