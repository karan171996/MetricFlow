import { analyzeMetrics } from '@/lib/aiAnalysis';
import { recordTiming } from '@/lib/apiTimingStore';
import { AI_PROVIDERS, activeAi } from '@/lib/env';
import { requireJson } from '@/lib/localRequest';

export async function POST(request: Request) {
  const notJson = requireJson(request);
  if (notJson) return notJson;
  try {
    const data = await request.json();

    const ai = activeAi();
    const start = performance.now();
    const analysis = await analyzeMetrics(data.metrics, ai);
    // No key means no provider call, so there is no response time to show.
    if (ai) recordTiming(`${AI_PROVIDERS[ai.provider].label}: analyze`, performance.now() - start);

    return Response.json(analysis);
  } catch {
    // Fixed text only: the caught error is never logged or returned (it can carry the request, and so a key).
    console.error('[analyze] failed');
    return Response.json({ error: 'Could not analyze the metrics.' }, { status: 500 });
  }
}