import type { NextRequest } from 'next/server';

/**
 * What `@/lib/hosted/proxy` resolves to when the hosted build is absent (this MIT repo):
 * METRICFLOW_MODE=hosted without the private code refuses everything. Fixed text, names nothing.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- same contract as the hosted proxy
export default async function hostedProxy(_request: NextRequest): Promise<Response | undefined> {
  return Response.json({ error: 'Hosted build missing.' }, { status: 503 });
}
