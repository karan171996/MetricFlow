import { analyzeMetrics } from '@/lib/aiAnalysis';
import { recordTiming } from '@/lib/apiTimingStore';
import { AI_PROVIDERS, activeAi } from '@/lib/env';

export async function POST(request: Request) {
  try {
    const data = await request.json();

    const ai = activeAi();
    const start = performance.now();
    const analysis = await analyzeMetrics(data.metrics, ai);
    recordTiming(`${ai ? AI_PROVIDERS[ai.provider].label : 'AI'}: analyze`, performance.now() - start);

    return Response.json(analysis);
  } catch (error) {
    console.error('Analysis API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}