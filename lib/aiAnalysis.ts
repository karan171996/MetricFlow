import axios from 'axios';
import type { AiProvider } from '@/lib/env';

// flash-lite: Gemini's cheapest/lowest-latency tier, and "-latest" tracks
// the current version instead of a dated name that Google later retires.
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent';

interface PageMetrics {
  name: string;
  url: string;
  newRelic?: { loadTime?: number; errorRate?: number };
  sentry?: { errorCount?: number };
}

interface Metrics {
  pages?: PageMetrics[];
}

const MAX_TOKENS = 512;

// Each provider: send the prompt, return the reply text. Cheapest current tier of each.
const PROVIDERS: Record<AiProvider, (prompt: string, key: string) => Promise<string>> = {
  gemini: async (prompt, key) => {
    const res = await axios.post(
      `${GEMINI_API_URL}?key=${key}`,
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: MAX_TOKENS } },
      { headers: { 'content-type': 'application/json' } }
    );
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  },
  claude: async (prompt, key) => {
    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: 'claude-haiku-4-5-20251001', max_tokens: MAX_TOKENS, messages: [{ role: 'user', content: prompt }] },
      { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } }
    );
    return res.data?.content?.[0]?.text ?? '';
  },
  openai: async (prompt, key) => {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      { model: 'gpt-4o-mini', max_tokens: MAX_TOKENS, messages: [{ role: 'user', content: prompt }] },
      { headers: { Authorization: `Bearer ${key}` } }
    );
    return res.data?.choices?.[0]?.message?.content ?? '';
  }
};

export async function analyzeMetrics(metrics: Metrics, ai: { provider: AiProvider; key: string } | null) {
  if (!ai) {
    return getMockAnalysis();
  }

  try {
    return parseAnalysisResponse(await PROVIDERS[ai.provider](formatMetricsForPrompt(metrics), ai.key));
  } catch (error) {
    // Log the status only: an axios error carries the key in its request config.
    console.error(`${ai.provider} API error:`, axios.isAxiosError(error) ? error.response?.status : 'failed');
    return getMockAnalysis();
  }
}

function formatMetricsForPrompt(metrics: Metrics) {
  let prompt = `Analyze these website performance metrics and provide insights:

`;

  metrics.pages?.forEach((page: PageMetrics) => {
    prompt += `
Page: ${page.name} (${page.url})
- Load Time: ${page.newRelic?.loadTime}ms
- Error Rate: ${page.newRelic?.errorRate}%
- Errors: ${page.sentry?.errorCount} errors

`;
  });

  prompt += `
Please provide:
1. Which pages have performance issues?
2. Are there correlations between errors and load time?
3. What are the top 3 recommendations for improvement?
4. Which pages need immediate attention?

Respond with ONLY raw JSON (no markdown fences) with keys: analysis, alerts, recommendations.
Each alert must have: severity ("high"|"medium"|"low"), page, message, metric.
"metric" must be a SHORT single label naming which metric triggered the alert
(e.g. "loadTime", "lcp", "ttfb", "errorRate", "errorCount", "apdexScore") —
never a sentence or multiple values.`;

  return prompt;
}

function parseAnalysisResponse(text: string) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('Error parsing Gemini response:', error);
  }

  return getMockAnalysis();
}

function getMockAnalysis() {
  return {
    analysis: 'Home page is loading slower than expected with 5 errors. Dashboard has better performance but shows network issues.',
    alerts: [
      {
        severity: 'high',
        page: '/',
        message: 'Home page load time is 1200ms (threshold: 1000ms)',
        metric: 'loadTime'
      },
      {
        severity: 'medium',
        page: '/dashboard',
        message: 'Dashboard has 2 network errors',
        metric: 'errorCount'
      }
    ],
    recommendations: [
      'Optimize images on home page - they account for 40% of load time',
      'Implement lazy loading for below-the-fold content',
      'Cache API responses to reduce network calls',
      'Review error handling in dashboard network requests'
    ]
  };
}
