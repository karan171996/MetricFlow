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
// Below the dashboard's 30s refresh: a hung provider fails as `provider_error` before the next refresh asks again.
const TIMEOUT_MS = 20_000;

// Each provider: send the prompt, return the reply text. Cheapest current tier of each.
const PROVIDERS: Record<AiProvider, (prompt: string, key: string) => Promise<string>> = {
  gemini: async (prompt, key) => {
    const res = await axios.post(
      `${GEMINI_API_URL}?key=${key}`,
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: MAX_TOKENS } },
      { headers: { 'content-type': 'application/json' }, timeout: TIMEOUT_MS }
    );
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  },
  claude: async (prompt, key) => {
    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: 'claude-haiku-4-5-20251001', max_tokens: MAX_TOKENS, messages: [{ role: 'user', content: prompt }] },
      { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, timeout: TIMEOUT_MS }
    );
    return res.data?.content?.[0]?.text ?? '';
  },
  openai: async (prompt, key) => {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      { model: 'gpt-4o-mini', max_tokens: MAX_TOKENS, messages: [{ role: 'user', content: prompt }] },
      { headers: { Authorization: `Bearer ${key}` }, timeout: TIMEOUT_MS }
    );
    return res.data?.choices?.[0]?.message?.content ?? '';
  }
};

interface AnalysisAlert {
  severity: 'high' | 'medium' | 'low';
  page: string;
  message: string;
  metric: string;
}

/** A real model reply. `status` is set here, after the reply's own fields, so a model cannot fake it. */
export interface AnalysisOk {
  status: 'ok';
  analysis?: string;
  alerts?: AnalysisAlert[];
  recommendations?: string[];
}

/** No analysis to show. `reason` is one of these fixed values, never provider text (that can carry the key). */
export interface AnalysisUnavailable {
  status: 'unavailable';
  reason: 'no_key' | 'provider_error' | 'bad_response';
}

export type AnalysisResult = AnalysisOk | AnalysisUnavailable;

const unavailable = (reason: AnalysisUnavailable['reason']): AnalysisUnavailable => ({ status: 'unavailable', reason });

export async function analyzeMetrics(metrics: Metrics, ai: { provider: AiProvider; key: string } | null): Promise<AnalysisResult> {
  if (!ai) return unavailable('no_key');

  let text: string;
  try {
    text = await PROVIDERS[ai.provider](formatMetricsForPrompt(metrics), ai.key);
  } catch (error) {
    // Log the status only: an axios error carries the key in its request config.
    console.error(`${ai.provider} API error:`, axios.isAxiosError(error) ? error.response?.status : 'failed');
    return unavailable('provider_error');
  }

  const parsed = parseAnalysisResponse(text);
  if (!parsed) return unavailable('bad_response');
  // No Sentry data went in, so no error-count alert may come out (a model can produce one anyway).
  const hasSentry = metrics.pages?.some((p) => p.sentry);
  const alerts = hasSentry ? parsed.alerts : parsed.alerts?.filter((x) => x.metric !=='errorCount');
  return { ...parsed, ...(alerts && { alerts }), status: 'ok' };
}

function formatMetricsForPrompt(metrics: Metrics) {
  let prompt = `Analyze these website performance metrics and provide insights:

`;

  const hasSentry = Boolean(metrics.pages?.some((p) => p.sentry));
  metrics.pages?.forEach((page: PageMetrics) => {
    prompt += `
Page: ${page.name} (${page.url})
${page.newRelic ? `- Load Time: ${page.newRelic.loadTime}ms\n- Error Rate: ${page.newRelic.errorRate}%\n` : ''}${page.sentry ? `- Errors: ${page.sentry.errorCount} errors\n` : ''}
`;
  });

  prompt += `
Please provide:
1. Which pages have performance issues?
${hasSentry ? '2. Are there correlations between errors and load time?' : '2. Which metrics are furthest from healthy?'}
3. What are the top 3 recommendations for improvement?
4. Which pages need immediate attention?

Respond with ONLY raw JSON (no markdown fences) with keys: analysis, alerts, recommendations.
Each alert must have: severity ("high"|"medium"|"low"), page, message, metric.
"metric" must be a SHORT single label naming which metric triggered the alert
(e.g. "loadTime", "lcp", "ttfb", "errorRate", ${hasSentry ? '"errorCount", ' : ''}"apdexScore") —
never a sentence or multiple values.`;

  return prompt;
}

/**
 * The reply as an object where `alerts` and `recommendations` are each an array or absent and at least one
 * is an array, or null for anything else. Callers `.filter` and `.map` both, so a non-array must not pass.
 */
function parseAnalysisResponse(text: string): Omit<AnalysisOk, 'status'> | null {
  try {
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? 'null');
    const lists = [parsed?.alerts, parsed?.recommendations];
    if (lists.every((x) => x === undefined || Array.isArray(x)) && lists.some(Array.isArray)) return parsed;
  } catch {
    // Not JSON: falls through to null. The reply text is not logged.
  }
  return null;
}
