// Public identifiers only. Never put a secret in these strings: the snippet is pasted into a public site.
export interface SnippetValues {
  /** Connected tools. Only their blocks are shown; undefined (still loading) shows both. */
  tools?: string[];
  accountId?: string | null;
  applicationId?: string | null;
  browserKey?: string | null;
  region?: string | null;
  dsn?: string | null;
}

const line = (key: string, value: string, hint?: string) => `    ${key}: '${value}',${hint ? `   // ${hint}` : ''}`;

/** The one call a site makes. Real values where the dashboard could read them, shaped examples to replace otherwise. */
export function initSnippet({ tools, accountId, applicationId, browserKey, region, dsn }: SnippetValues = {}) {
  const blocks: string[] = [];
  if (!tools || tools.includes('new-relic')) {
    blocks.push([
      `  'new-relic': {`,
      line('browserKey', browserKey ?? 'NRJS-xxxxxxxxxxxxxxxxxxx', browserKey ? undefined : 'replace: New Relic > API keys > Ingest - Browser. Starts NRJS-, NOT your NRAK- User key'),
      line('applicationId', applicationId ?? '123456789', applicationId ? undefined : 'replace: New Relic > Add data > Browser monitoring. NOT your account ID'),
      line('accountId', accountId ?? '1234567', accountId ? undefined : 'replace: your New Relic account ID'),
      ...(region === 'eu' ? [line('region', 'eu')] : []),
      `  },`,
    ].join('\n'));
  }
  if (!tools || tools.includes('sentry')) {
    blocks.push([
      `  sentry: {`,
      line('dsn', dsn ?? 'https://00000000000000000000000000000000@o0.ingest.sentry.io/0', dsn ? undefined : 'replace: Sentry > Project settings > Client Keys (DSN)'),
      `  },`,
    ].join('\n'));
  }
  return `// npm i @karan171996/metricflow
// Call init once, when your site starts. In Next.js put this in instrumentation-client.ts.
// If your site already runs its own Sentry, call init after it.
import { init } from '@karan171996/metricflow/browser';

init({
${blocks.join('\n')}
});`;
}

export const SEND_SNIPPET = `// Records a MetricFlowEvent in New Relic. Does nothing before init, and nothing for Sentry.
import { send } from '@karan171996/metricflow/browser';

send('checkout_step', 2, { step: 'payment' });`;
