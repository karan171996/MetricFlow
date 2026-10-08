// The only file that names @sentry/browser. sentry.mts loads it lazily, after its own checks.
// Static, named imports on purpose: a bundler can then drop what is not named here. With
// `await import('@sentry/browser')` the whole package, session replay and feedback included,
// lands in the consumer's chunk (measured with Next 16 / Turbopack: 439 kB against 140 kB).
import { browserTracingIntegration, getClient, init } from '@sentry/browser';

/** Starts Sentry. Returns false, and changes nothing, if a client is already running. */
export function start(dsn: string, tracesSampleRate: number): boolean {
  if (getClient()) return false; // a de-duplicated copy that started while ours loaded
  init({
    dsn,
    sendDefaultPii: false, // explicit, not left to the SDK default
    tracesSampleRate,
    // SDK defaults plus tracing only. No replay, feedback or profiling integration is imported.
    integrations: [browserTracingIntegration({
      // Pins the page name to the real path so the dashboard can match it. Any ID in the path is sent (see README).
      beforeStartSpan: ctx => ({ ...ctx, name: window.location.pathname }),
    })],
  });
  return true;
}
