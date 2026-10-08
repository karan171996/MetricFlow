// Sentry's checks. Loaded lazily by index.mts; loads the SDK (sentry-sdk.mts) lazily itself, only once the checks pass.
import type { BrowserTool, SentryOptions } from './index.mjs';

const BAD_DSN = 'the DSN is not a public Sentry DSN. Copy it from Sentry > Project settings > Client Keys (DSN).';
const LEGACY_DSN = 'the DSN is a legacy one that contains a secret key after ":". Copy the DSN from Sentry > Project settings > Client Keys (DSN), and revoke the old key.';
const BAD_RATE = 'tracesSampleRate must be a number from 0 to 1.';
const BAD_OPTION = 'only "dsn" and "tracesSampleRate" are accepted.';
const EXISTING = 'MetricFlow: Sentry is already running on this page; MetricFlow left it as it is.';

function check(options: SentryOptions): string | null {
  if (options === null || typeof options !== 'object') return BAD_OPTION;
  if (Object.keys(options).some(k => k !== 'dsn' && k !== 'tracesSampleRate')) return BAD_OPTION;
  const { dsn, tracesSampleRate: rate } = options;
  if (typeof dsn !== 'string') return BAD_DSN;
  let url: URL;
  try { url = new URL(dsn); } catch { return BAD_DSN; } // the caught error holds the input in some browsers: never log it
  if (url.password !== '') return LEGACY_DSN;
  if (!/^https?:$/.test(url.protocol) || !/^[a-f0-9]{32}$/i.test(url.username) || !/^(\/[\w-]+)*\/\d+$/.test(url.pathname) || url.search !== '' || url.hash !== '') return BAD_DSN;
  if (rate !== undefined && !(typeof rate === 'number' && rate >= 0 && rate <= 1)) return BAD_RATE; // NaN fails both comparisons
  return null;
}

// The dashboard lists local pages only, where sampling 1 in 10 looks like "nothing arrives".
const defaultRate = () => (['localhost', '127.0.0.1'].includes(window.location.hostname) ? 1 : 0.1);

async function init(options: SentryOptions): Promise<void> {
  // Checked before the import, so a site with its own Sentry downloads no second copy.
  // Known false positive: an SDK that was loaded but never initialised is skipped too.
  if ('__SENTRY__' in window) return console.warn(EXISTING);
  const { start } = await import('./sentry-sdk.mjs');
  if (!start(options.dsn, options.tracesSampleRate ?? defaultRate())) console.warn(EXISTING);
}

// The dashboard reads no custom events from Sentry, so send does nothing.
export const tool: BrowserTool<SentryOptions> = { check, init, send() {} };
