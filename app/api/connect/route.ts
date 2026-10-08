import { INSERT_KEY, connectedTools, env, isToolConnected } from '@/lib/env';
import { isLocalRequest, requireJson, REFUSAL_MESSAGE } from '@/lib/localRequest';
import { publicDsn } from '@/lib/sentryDsn';
import { browserSetup, newRelicStatus, sendTestEvent, sentryStatus } from '@/lib/connectStatus';

const refuse = () => Response.json({ error: REFUSAL_MESSAGE() }, { status: 403 });

/** Per-source "events received" status. Never returns secrets: the DSN is re-serialised from its parsed public parts. */
export async function GET(request: Request) {
  if (!isLocalRequest(request)) return refuse();
  const tools = connectedTools();
  if (!tools.length) return Response.json({ configured: false });

  // Only the connected tools are asked: a New Relic-only user never triggers a Sentry call, and the reverse.
  const nr = isToolConnected('new-relic');
  const sentry = isToolConnected('sentry');
  const nrKey = env('NEWRELIC_API_KEY');
  const acct = env('NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID');
  const [browser, ajax, custom, sentryStatusResult, setup] = await Promise.all([
    nr ? newRelicStatus(nrKey, acct, 'PageView') : undefined,
    nr ? newRelicStatus(nrKey, acct, 'AjaxRequest') : undefined,
    nr ? newRelicStatus(nrKey, acct, 'MetricFlowEvent') : undefined,
    sentry ? sentryStatus(env('SENTRY_API_KEY'), env('SENTRY_DSN')) : undefined,
    nr ? browserSetup(nrKey, acct) : undefined
  ]);
  return Response.json({ configured: true, tools, accountId: nr ? acct : undefined, insertKeySet: Boolean(env(INSERT_KEY)), dsn: sentry ? (publicDsn(env('SENTRY_DSN')) ?? undefined) : undefined, browser, ajax, custom, sentry: sentryStatusResult, setup });
}

/** Sends one test event so the user can watch it arrive. */
export async function POST(request: Request) {
  if (!isLocalRequest(request)) return refuse();
  const notJson = requireJson(request);
  if (notJson) return notJson;
  if (!env(INSERT_KEY)) {
    return Response.json({ sent: false, error: 'Add your Insert key first.' }, { status: 400 });
  }
  const error = await sendTestEvent(env(INSERT_KEY), env('NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID'));
  return error ? Response.json({ sent: false, error }, { status: 502 }) : Response.json({ sent: true });
}
