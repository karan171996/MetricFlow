const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Set by the CLI when started with a non-loopback --host: the 127.0.0.1 bind no longer protects us. */
export const isExposed = () => process.env.METRICFLOW_EXPOSED === '1';

export const REFUSAL_MESSAGE = () =>
  isExposed()
    ? 'Setup and Connect are disabled because the dashboard is exposed on the network (--host). Restart without --host to use them.'
    : 'Setup is only available from localhost.';

/** Setup writes secrets to disk, so it only answers requests addressed to this machine. */
export function isLocalRequest(request: Request): boolean {
  if (isExposed()) return false;
  // Next sets x-forwarded-for to the socket address itself, so only a non-loopback hop means a real proxy.
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded && !forwarded.split(',').every(ip => LOOPBACK_IPS.has(ip.trim().replace(/^\[|\]$/g, '')))) return false;
  // Browsers set this on a request made by another site's page; curl and older browsers send nothing.
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const host = (request.headers.get('host') ?? '').replace(/:\d+$/, '');
  if (!LOCAL_HOSTS.has(host)) return false;
  const origin = request.headers.get('origin');
  try {
    return !origin || LOCAL_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}
