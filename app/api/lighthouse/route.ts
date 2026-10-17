import { env } from '@/lib/env';
import { getStatus, startRun } from '@/lib/lighthouseRun';
import { isLocalRequest, requireJson, PROXY_REFUSAL } from '@/lib/localRequest';

const refuse = () => Response.json({ error: PROXY_REFUSAL }, { status: 403 });

/** The run status: `{ state, done, total, lastRunAt, error? }`, plus `target`: whether a project address is set. */
export async function GET(request: Request) {
  if (!isLocalRequest(request)) return refuse();
  return Response.json({ ...getStatus(), target: Boolean(env('LIGHTHOUSE_TARGET')) });
}

/** "Run now": starts a run in the background, or joins the one in progress. */
export async function POST(request: Request) {
  if (!isLocalRequest(request)) return refuse();
  const notJson = requireJson(request);
  if (notJson) return notJson;
  if (!env('LIGHTHOUSE_TARGET')) return Response.json({ error: 'Add a project address on the setup page first.' }, { status: 409 });
  void startRun();
  return Response.json({ ...getStatus(), target: true }, { status: 202 });
}
