import { analyzeMetrics } from '@/lib/aiAnalysis';
import { mockAnalysis } from '@/lib/mockData';

export async function POST(request: Request) {
  try {
    const data = await request.json();

    // For initial testing, use mock data
    const useRealAPI = true; // Set to false to fall back to mock data

    if (!useRealAPI) {
      return Response.json(mockAnalysis);
    }

    const analysis = await analyzeMetrics(
      data.metrics,
      process.env.GEMINI_API_KEY ?? ''
    );

    return Response.json(analysis);
  } catch (error) {
    console.error('Analysis API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}