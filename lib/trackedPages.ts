/** Pages this dashboard tracks. Same list used to seed mockData.ts. */
export const TRACKED_PAGES = [
  { name: 'Homepage', slug: 'homepage', url: '/' },
  { name: 'Pricing', slug: 'pricing', url: '/pricing' },
  { name: 'Blog Core', slug: 'blog', url: '/blog' },
  { name: 'Checkout Flow', slug: 'checkout', url: '/checkout' },
  { name: 'Documentation', slug: 'docs', url: '/docs' }
] as const;
