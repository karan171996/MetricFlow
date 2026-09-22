export const mockMetrics = {
    pages: [
      {
        name: 'Homepage',
        slug: 'homepage',
        url: '/',
        visitors: '45.2k',
        status: 'Healthy',
        newRelic: {
          loadTime: 845,
          lcp: 800,
          ttfb: 100,
          fid: 50,
          errorRate: 0.12,
          throughput: 1000,
          apdexScore: 0.95
        },
        sentry: {
          errorCount: 12,
          errorRate: 0.12,
          warningCount: 2,
          latestErrors: [
            {
              title: 'TypeError: Cannot read property "length" of undefined',
              count: 3,
              lastSeen: '2026-09-20T20:40:00Z'
            }
          ]
        },
        recordedAt: new Date().toISOString()
      },
      {
        name: 'Pricing',
        slug: 'pricing',
        url: '/pricing',
        visitors: '12.1k',
        status: 'Healthy',
        newRelic: {
          loadTime: 920,
          lcp: 650,
          ttfb: 90,
          fid: 40,
          errorRate: 0.05,
          throughput: 500,
          apdexScore: 0.97
        },
        sentry: {
          errorCount: 2,
          errorRate: 0.05,
          warningCount: 0,
          latestErrors: []
        },
        recordedAt: new Date().toISOString()
      },
      {
        name: 'Blog Core',
        slug: 'blog',
        url: '/blog',
        visitors: '84.5k',
        status: 'Warning',
        newRelic: {
          loadTime: 1400,
          lcp: 1100,
          ttfb: 180,
          fid: 90,
          errorRate: 0.4,
          throughput: 2000,
          apdexScore: 0.88
        },
        sentry: {
          errorCount: 45,
          errorRate: 0.4,
          warningCount: 6,
          latestErrors: [
            {
              title: 'NetworkError: Failed to fetch',
              count: 12,
              lastSeen: '2026-09-21T09:15:00Z'
            }
          ]
        },
        recordedAt: new Date().toISOString()
      },
      {
        name: 'Checkout Flow',
        slug: 'checkout',
        url: '/checkout',
        visitors: '8.4k',
        status: 'Critical',
        newRelic: {
          loadTime: 2100,
          lcp: 1800,
          ttfb: 320,
          fid: 150,
          errorRate: 1.2,
          throughput: 300,
          apdexScore: 0.62
        },
        sentry: {
          errorCount: 84,
          errorRate: 1.2,
          warningCount: 10,
          latestErrors: [
            {
              title: 'ValidationError: Invalid input',
              count: 30,
              lastSeen: '2026-09-22T05:05:00Z'
            }
          ]
        },
        recordedAt: new Date().toISOString()
      },
      {
        name: 'Documentation',
        slug: 'docs',
        url: '/docs',
        visitors: '24.1k',
        status: 'Healthy',
        newRelic: {
          loadTime: 780,
          lcp: 600,
          ttfb: 70,
          fid: 25,
          errorRate: 0.02,
          throughput: 700,
          apdexScore: 0.99
        },
        sentry: {
          errorCount: 5,
          errorRate: 0.02,
          warningCount: 0,
          latestErrors: []
        },
        recordedAt: new Date().toISOString()
      }
    ],
    timestamp: new Date().toISOString()
  };
  
  export const mockAnalysis = {
    analysis: 'Home page performance is degrading. Load time increased 20% in last 24 hours. Dashboard is performing well.',
    alerts: [
      {
        id: 'alert-1',
        severity: 'high',
        type: 'performance',
        page: 'checkout',
        message: 'Checkout Flow load time is 2100ms (threshold: 1000ms)',
        metric: 'loadTime',
        currentValue: 2100,
        threshold: 1000,
        createdAt: new Date().toISOString(),
        status: 'active'
      },
      {
        id: 'alert-2',
        severity: 'medium',
        type: 'error',
        page: 'blog',
        message: 'Blog Core error rate is 0.4% (threshold: 0.2%)',
        metric: 'errorRate',
        currentValue: 0.4,
        threshold: 0.2,
        createdAt: new Date().toISOString(),
        status: 'active'
      }
    ],
    recommendations: [
      'Optimize home page images',
      'Implement lazy loading',
      'Cache API responses',
      'Review error handling'
    ]
  };