// Consumer entry point, published as the "./browser" export of this package (init and send).
// This tree is sealed (tsconfig.browser.json, test/browser-entry.test.mjs): it imports nothing
// outside browser/, reads no environment and has no static import of a vendor or tool module,
// so a site that never calls init downloads no vendor code.

export type Attrs = Record<string, string | number | boolean>;
export interface SentryOptions { dsn: string; tracesSampleRate?: number }
export interface NewRelicOptions { browserKey: string; applicationId: string; accountId: string; region?: 'us' | 'eu' }
/** Public identifiers only. A value that looks like a secret is refused and no tool starts. */
export interface InitOptions {
  sentry?: SentryOptions;
  'new-relic'?: NewRelicOptions;
}

export interface BrowserTool<O> {
  /** Allow-list. Returns a fixed reason string if a value is malformed. Runs before any vendor code loads. */
  check(options: O): string | null;
  /** May throw; index catches and warns once. */
  init(options: O): Promise<void>;
  send(name: string, value: number, attrs: Attrs): void;
}

const LABELS = { sentry: 'Sentry', 'new-relic': 'New Relic' } as const;
type ToolId = keyof typeof LABELS;

const LOADERS: { [K in ToolId]: () => Promise<{ tool: BrowserTool<never> }> } = {
  sentry: () => import('./sentry.mjs'),
  'new-relic': () => import('./newrelic.mjs'),
};

// Secrets that must never reach a browser. Tested against every string in the options and
// against each part of it split on URL delimiters, so a token in a DSN's user part is caught.
const DENY = [
  /^NR(?!JS-)[A-Z]{2}-/i, // every New Relic key prefix except the public browser key
  /^sntry[a-z0-9]?_/i, // every Sentry token prefix (sntrys_ org, sntryu_ user, and any later kind)
  /NRAL$/i, // New Relic ingest licence key
  /^[a-f0-9]{64}$/i, // legacy Sentry auth token
];
// Not a known secret format, but shaped like a key: 40 or more key characters in one piece (a 40-hex
// legacy New Relic licence key, for one). Only consulted once a value has already failed a tool's
// allow-list, so a valid 32-hex DSN key or NRJS- key never gets here.
const KEY_SHAPED = [/^(?!NRJS-)[a-z0-9_-]{40,}$/i];

function hasSecret(value: unknown, rules = DENY, depth = 0): boolean {
  if (typeof value === 'string') return [value, ...value.split(/[:/@?#&=\s]+/)].some(part => rules.some(rule => rule.test(part)));
  if (value !== null && typeof value === 'object' && depth < 4) return Object.values(value).some(v => hasSecret(v, rules, depth + 1));
  return false;
}

// Every warning is a fixed string. Nothing caught and no option value is ever passed to console.
const warn = (text: string) => {
  try { console.warn(`MetricFlow: ${text}`); } catch { /* a broken console must not break the site */ }
};

let called = false;
let warnedAgain = false;
const started: BrowserTool<never>[] = [];

/** Starts the named tools. Call once, in the browser. Never throws, never rejects. No-op without `window`. */
export async function init(options: InitOptions): Promise<void> {
  try {
    if (typeof window === 'undefined') return;
    if (called) {
      if (!warnedAgain) warn('init was already called; this call did nothing.');
      warnedAgain = true;
      return;
    }
    called = true;
    if (options === null || typeof options !== 'object') return warn('init needs an options object. No tool was started.');

    // 1. Deny rules, over everything that was passed, before any other module is requested.
    for (const [key, value] of Object.entries(options)) {
      if (hasSecret(value)) {
        const label = Object.hasOwn(LABELS, key) ? LABELS[key as ToolId] : 'an unknown tool'; // never the caller's own text
        return warn(`a secret key was passed to init for ${label}. Nothing was sent. This key is already in your site's public JavaScript: revoke it now and create a new one.`);
      }
    }

    // A mistyped tool name ("newrelic") must not fail silently. The key itself is the caller's text: never printed.
    if (Object.keys(options).some(key => !Object.hasOwn(LABELS, key))) return warn('init was given an option that is not a tool. The tools are "sentry" and "new-relic". No tool was started.');

    // 2. Load only the named tools' own (small) modules. Vendor code is not requested yet.
    const ids = (Object.keys(LABELS) as ToolId[]).filter(id => options[id] !== undefined);
    if (ids.length === 0) return warn('init was not given a tool. Name "sentry", "new-relic" or both. No tool was started.');
    const loaded: { id: ToolId; tool: BrowserTool<never> }[] = [];
    await Promise.all(ids.map(async id => {
      try { loaded.push({ id, tool: (await LOADERS[id]()).tool }); } catch { warn(`${LABELS[id]} could not be loaded. Your site is not affected.`); }
    }));

    // 3. Allow-list. One bad value starts no tool at all.
    for (const { id, tool } of loaded) {
      const reason = tool.check(options[id] as never);
      if (!reason) continue;
      if (hasSecret(options[id], KEY_SHAPED)) return warn(`${LABELS[id]} was not started: a value passed to init looks like a secret key, not a public identifier. If it is one, it is already in your site's public JavaScript: revoke it now and create a new one. No tool was started.`);
      return warn(`${LABELS[id]} was not started: ${reason} No tool was started.`);
    }

    // 4. Start in parallel; one failing does not stop the other or the page.
    await Promise.all(loaded.map(async ({ id, tool }) => {
      try {
        await tool.init(options[id] as never);
        started.push(tool);
      } catch { warn(`${LABELS[id]} could not be started. Your site is not affected.`); }
    }));
  } catch {
    warn('init failed. Your site is not affected.');
  }
}

/** Records a custom event on every started tool that can take it. No-op before init. Never throws. */
export function send(name: string, value: number, attrs: Attrs = {}): void {
  if (typeof name !== 'string' || typeof value !== 'number') return;
  for (const tool of started) {
    try { tool.send(name, value, attrs); } catch { /* never break the caller */ }
  }
}
