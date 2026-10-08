// New Relic's checks. Loaded lazily by index.mts; loads the agent (newrelic-agent.mts) lazily itself, only once the checks pass.
import type { Attrs, BrowserTool, NewRelicOptions } from './index.mjs';

const BAD_KEY = 'browserKey must be the "Ingest - Browser" key, which starts with NRJS-. Copy the key value, not the ID shown beside it.';
const BAD_ID = 'applicationId and accountId must be plain numbers, passed as strings.';
const BAD_REGION = 'region must be "us" or "eu".';
const BAD_OPTION = 'only "browserKey", "applicationId", "accountId" and "region" are accepted.';
const EXISTING = 'MetricFlow: New Relic is already running on this page; MetricFlow left it as it is.';
const ALLOWED = ['browserKey', 'applicationId', 'accountId', 'region'];

// The EU host is from New Relic's documentation; it has not been tried against an EU account.
const BEACONS = { us: 'bam.nr-data.net', eu: 'bam.eu01.nr-data.net' };

function check(options: NewRelicOptions): string | null {
  if (options === null || typeof options !== 'object') return BAD_OPTION;
  if (Object.keys(options).some(k => !ALLOWED.includes(k))) return BAD_OPTION;
  const { browserKey, applicationId, accountId, region } = options;
  if (typeof browserKey !== 'string' || !/^NRJS-[a-z0-9]+$/i.test(browserKey)) return BAD_KEY;
  if (![applicationId, accountId].every(id => typeof id === 'string' && /^\d+$/.test(id))) return BAD_ID;
  if (region !== undefined && region !== 'us' && region !== 'eu') return BAD_REGION;
  return null;
}

let agent: { recordCustomEvent(type: string, attributes: Record<string, unknown>): unknown } | undefined;

async function init({ browserKey, applicationId, accountId, region }: NewRelicOptions): Promise<void> {
  // Checked before the import, so a site with its own agent or copy-paste snippet gets no second agent.
  if ('NREUM' in window || 'newrelic' in window) return console.warn(EXISTING);
  const { start } = await import('./newrelic-agent.mjs');
  agent = start(browserKey, applicationId, accountId, BEACONS[region ?? 'us']);
}

function send(name: string, value: number, attrs: Attrs): void {
  // attrs first: a caller's own "name", "value" or "page" must not replace the fields the dashboard reads.
  agent?.recordCustomEvent('MetricFlowEvent', { ...attrs, name, value, page: window.location.pathname });
}

export const tool: BrowserTool<NewRelicOptions> = { check, init, send };
