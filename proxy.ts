import { isExposed, isLocalRequest, PROXY_REFUSAL } from '@/lib/localRequest';

/**
 * The dashboard holds API keys, so unless it is deliberately exposed (--host) every /api route
 * only answers requests addressed to this machine: no DNS rebinding, no cross-site calls.
 * Exposed mode passes through; the routes that write or reveal keys still refuse on their own.
 */
export function proxy(request: Request) {
  if (isExposed() || isLocalRequest(request)) return;
  return Response.json({ error: PROXY_REFUSAL }, { status: 403 });
}

export const config = { matcher: '/api/:path*' };
