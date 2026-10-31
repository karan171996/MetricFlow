import type { NextRequest } from 'next/server';
import { isExposed, isHosted, isLocalRequest, PROXY_REFUSAL } from '@/lib/localRequest';

// Every spelling Next could route to app/api: /api, /API/x, //api/x, /%61pi/x.
const API_PATH = /^\/+api(\/|$)/i;
const isApiPath = (url: string) => {
  const path = new URL(url).pathname;
  try { return API_PATH.test(decodeURIComponent(path)); } catch { return API_PATH.test(path); }
};

/**
 * The dashboard holds API keys, so unless it is deliberately exposed (--host) every /api route
 * only answers requests addressed to this machine: no DNS rebinding, no cross-site calls.
 * Exposed mode passes through; the routes that write or reveal keys still refuse on their own.
 * METRICFLOW_MODE=hosted hands every request to the hosted build's proxy. Without the hosted build
 * that import resolves to lib/hosted-stub (tsconfig paths fallback), which answers 503.
 */
export async function proxy(request: NextRequest) {
  if (isHosted()) return (await import('@/lib/hosted/proxy')).default(request);
  if (!isApiPath(request.url)) return;
  if (isExposed() || isLocalRequest(request)) return;
  return Response.json({ error: PROXY_REFUSAL }, { status: 403 });
}

// Pages are matched too, for the hosted proxy; locally they pass straight through.
export const config = { matcher: ['/api/:path*', '/((?!_next|.*\\..*).*)'] };
