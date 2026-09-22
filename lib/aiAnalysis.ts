import axios from 'axios';

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

export async function analyzeMetrics(metrics: Metrics, apiKey: string) {
  if (!apiKey) {
    return getMockAnalysis();
  }

  try {
    const prompt = formatMetricsForPrompt(metrics);

    const response = await axios.post(
      `${GEMINI_API_URL}?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 512 }
      },
      {
        headers: { 'content-type': 'application/json' }
      }
    );

    const text: string = response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return parseAnalysisResponse(text);
  } catch (error) {
    console.error('Gemini API error:', error);
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
