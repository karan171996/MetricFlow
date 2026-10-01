import { analyzeMetrics } from '@/lib/aiAnalysis';
import { recordTiming } from '@/lib/apiTimingStore';

export async function POST(request: Request) {
  try {
    const data = await request.json();

    const geminiStart = performance.now();
    const analysis = await analyzeMetrics(
      data.metrics,
      process.env.GEMINI_API_KEY ?? ''
    );
    recordTiming('Gemini: analyze', performance.now() - geminiStart);

    return Response.json(analysis);
  } catch (error) {
    console.error('Analysis API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}