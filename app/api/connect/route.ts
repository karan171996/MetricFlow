import { INSERT_KEY, env, isConfigured } from '@/lib/env';
import { isLocalRequest, REFUSAL_MESSAGE } from '@/lib/localRequest';
import { newRelicStatus, sendTestEvent, sentryStatus } from '@/lib/connectStatus';

const refuse = () => Response.json({ error: REFUSAL_MESSAGE() }, { status: 403 });

/** Per-source "events received" status. Never returns key values. */
export async function GET(request: Request) {
  if (!isLocalRequest(request)) return refuse();
  if (!isConfigured()) return Response.json({ configured: false });

  const nrKey = env('NEWRELIC_API_KEY');
  const acct = env('NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID');
  const [browser, custom, sentry] = await Promise.all([
    newRelicStatus(nrKey, acct, 'PageView'),
    newRelicStatus(nrKey, acct, 'MetricFlowEvent'),
    sentryStatus(env('SENTRY_API_KEY'), env('SENTRY_DSN'))
  ]);
  return Response.json({ configured: true, insertKeySet: Boolean(env(INSERT_KEY)), browser, custom, sentry });
}

/** Sends one test event so the user can watch it arrive. */
export async function POST(request: Request) {
  if (!isLocalRequest(request)) return refuse();
  if (!env(INSERT_KEY)) {
    return Response.json({ sent: false, error: 'Add your Insert key first.' }, { status: 400 });
  }
  const error = await sendTestEvent(env(INSERT_KEY), env('NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID'));
  return error ? Response.json({ sent: false, error }, { status: 502 }) : Response.json({ sent: true });
}
