import 'server-only';
import { MAX_PAGES, normalizePath } from '@/lib/discoverPages';
import { env } from '@/lib/env';
import { parseLighthouse } from '@/lib/lighthouse';
import type { PageMetrics } from '@/lib/metricsHistory';

// Fixed texts: none ever carries the setting, a URL, a path or a Lighthouse message.
export const NOT_INSTALLED = 'Lighthouse is not installed. Reinstall MetricFlow to add it.';
export const NO_CHROME = 'Lighthouse needs Google Chrome installed on this machine.';
export const RUN_FAILED = 'The Lighthouse run failed.';
export const TARGET_INVALID = 'The project address must be an http(s) URL with no user name or password in it.';
export const TARGET_UNREACHABLE = 'The project address did not answer with a page within 10 seconds.';

export const PAGE_MS = 60_000;
export const TOTAL_MS = 10 * 60_000;
export const STALE_MS = 60 * 60_000;
const FETCH_MS = 10_000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_HOPS = 3;

/** One GET, redirects not followed. Throws on a network error, a timeout or a body over the cap. */
export type Fetcher = (url: string) => Promise<{ status: number; location?: string; body: string }>;
/** One Lighthouse run of one URL, returning its LHR. Must stop when `signal` aborts. An error with `fatal: true` ends the whole run. */
export type Runner = (url: string, signal: AbortSignal) => Promise<unknown>;
type Modules = {
  lighthouse: (url: string, flags: Record<string, unknown>) => Promise<{ lhr: unknown } | undefined>;
  launch: (opts: Record<string, unknown>) => Promise<{ port: number; kill(): unknown }>;
};

const fatal = (message: string) => Object.assign(new Error(message), { fatal: true });

// No cookies (Node's fetch keeps none), no extra headers, and the body is capped while it streams.
const defaultFetcher: Fetcher = async url => {
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(FETCH_MS) });
  if (res.status >= 300 && res.status < 400) {
    await res.body?.cancel();
    return { status: res.status, location: res.headers.get('location') ?? undefined, body: '' };
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body?.getReader();
  for (let r = await reader?.read(); r && !r.done; r = await reader!.read()) {
    size += r.value.length;
    if (size > MAX_BYTES) { await reader!.cancel(); throw new Error('too large'); }
    chunks.push(r.value);
  }
  return { status: res.status, body: Buffer.concat(chunks).toString('utf8') };
};

/** Headless Chrome from this machine (never downloaded), a fresh temporary profile, killed in `finally`. */
const defaultRunner: Runner = async (url, signal) => {
  let mods: Modules;
  try { mods = await deps.load(); } catch { throw fatal(NOT_INSTALLED); }
  let chrome: Awaited<ReturnType<Modules['launch']>>;
  try { chrome = await mods.launch({ chromeFlags: ['--headless=new', '--disable-gpu'], logLevel: 'silent' }); } catch { throw fatal(NO_CHROME); }
  const kill = () => { try { return Promise.resolve(chrome.kill()).catch(() => {}); } catch { return Promise.resolve(); } };
  signal.addEventListener('abort', kill, { once: true });
  try {
    return (await mods.lighthouse(url, { port: chrome.port, output: 'json', logLevel: 'silent', onlyCategories: ['performance'] }))?.lhr;
  } finally {
    signal.removeEventListener('abort', kill);
    await kill();
  }
};

/** Swappable so node:test stubs the network and Chrome. Nothing else writes these. */
export const deps: { fetcher: Fetcher; runner: Runner; load: () => Promise<Modules> } = {
  fetcher: defaultFetcher,
  runner: defaultRunner,
  // Lazy: the package is optional and only loaded when a run starts. Both are in serverExternalPackages.
  load: async () => {
    const [lh, cl] = await Promise.all([import('lighthouse'), import('chrome-launcher')]);
    return { lighthouse: lh.default as unknown as Modules['lighthouse'], launch: cl.launch as unknown as Modules['launch'] };
  }
};

/** The target as a URL, or null: http(s) only, no credentials. Localhost, private hosts and any port are allowed (typed on the local-only /setup). */
export function parseTarget(spec: string): URL | null {
  let u: URL;
  try { u = new URL(spec); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  return u;
}

/** GET within the origin: redirects are followed only while they stay on it. Null on any failure. */
async function getSameOrigin(url: string, origin: string, fetcher: Fetcher): Promise<{ status: number; body: string } | null> {
  try {
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      const res = await fetcher(url);
      if (res.status < 300 || res.status >= 400) return res;
      if (!res.location) return null;
      const next = new URL(res.location, url);
      if (next.origin !== origin) return null;
      url = next.href;
    }
  } catch { /* network, timeout or cap: treated as no answer */ }
  return null;
}

const ok = (r: { status: number } | null): r is { status: number; body: string } => !!r && r.status >= 200 && r.status < 300;

/** The /setup check: one GET of the root that answers 2xx within 10s. */
export async function checkTarget(spec: string, fetcher: Fetcher = deps.fetcher): Promise<{ ok: true } | { ok: false; error: string }> {
  const u = parseTarget(spec);
  if (!u) return { ok: false, error: TARGET_INVALID };
  return ok(await getSameOrigin(`${u.origin}/`, u.origin, fetcher)) ? { ok: true } : { ok: false, error: TARGET_UNREACHABLE };
}

const decodeXml = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/**
 * `/` first, then the sitemap's `<loc>` entries, or the root page's links when there is no sitemap (one level, no crawl).
 * Same origin only, normalised, de-duplicated, assets dropped, at most MAX_PAGES. `url` keeps the path's case for the run.
 */
export async function discoverPages(target: string, fetcher: Fetcher = deps.fetcher): Promise<{ path: string; url: string }[]> {
  const origin = new URL(target).origin;
  const found: string[] = [];
  const sitemap = await getSameOrigin(`${origin}/sitemap.xml`, origin, fetcher);
  if (ok(sitemap)) for (const m of sitemap.body.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) found.push(decodeXml(m[1]));
  if (!found.length) {
    const root = await getSameOrigin(`${origin}/`, origin, fetcher);
    if (ok(root)) for (const m of root.body.matchAll(/<a\s[^>]*?href\s*=\s*["']([^"']+)["']/gi)) found.push(decodeXml(m[1]));
  }
  const out = new Map([['/', `${origin}/`]]);
  for (const raw of found) {
    if (out.size >= MAX_PAGES) break;
    let u: URL;
    try { u = new URL(raw, `${origin}/`); } catch { continue; }
    if (u.origin !== origin) continue;
    const last = u.pathname.split('/').pop() ?? '';
    if (/\.[a-z0-9]+$/i.test(last) && !/\.html$/i.test(last)) continue;
    const path = normalizePath(u.pathname);
    if (path && !out.has(path)) out.set(path, origin + u.pathname);
  }
  return [...out].map(([path, url]) => ({ path, url }));
}

export interface RunStatus { state: 'idle' | 'running' | 'error'; done: number; total: number; lastRunAt: string | null; error?: string }

// ponytail: one module-level store, like the history ring buffer; lost on restart, and the lazy schedule then runs again.
const blank = () => ({ status: { state: 'idle', done: 0, total: 0, lastRunAt: null } as RunStatus, target: '', byPath: {} as Record<string, PageMetrics>, current: null as Promise<void> | null });
let store = blank();

export const getStatus = (): RunStatus => ({ ...store.status });
/** Results of the last finished run of this target; empty before it finishes or after the target changed. */
export const getResults = (target: string): Record<string, PageMetrics> => (store.target === target ? store.byPath : {});
/** Tests only. */
export const resetRun = () => { store = blank(); };

/** True when the LHR's page is on the origin: a page that redirected away is dropped. */
function onOrigin(lhr: unknown, origin: string): boolean {
  const r = (lhr ?? {}) as Record<string, unknown>;
  const url = [r.finalDisplayedUrl, r.finalUrl, r.requestedUrl].find(u => typeof u === 'string' && u) as string | undefined;
  try { return !!url && new URL(url).origin === origin; } catch { return false; }
}

function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { ac.abort(); reject(new Error('timeout')); }, ms); });
  return Promise.race([fn(ac.signal), timeout]).finally(() => clearTimeout(timer));
}

export interface RunOptions { fetcher?: Fetcher; runner?: Runner; pageMs?: number; totalMs?: number }

/** Starts a run of LIGHTHOUSE_TARGET, or joins the one in progress. Never rejects. */
export function startRun(opts: RunOptions = {}): Promise<void> {
  if (store.current) return store.current;
  const target = env('LIGHTHOUSE_TARGET');
  if (!target) return Promise.resolve();
  const s = store;
  s.status = { state: 'running', done: 0, total: 0, lastRunAt: s.status.lastRunAt };
  s.current = run(s, target, opts).finally(() => { s.current = null; });
  return s.current;
}

/** The lazy schedule (no timer): starts a run when the target has none yet, changed, or its last finished run is over 60 min old. */
export function maybeStartRun(now = Date.now()): void {
  const target = env('LIGHTHOUSE_TARGET');
  if (!target || store.current) return;
  const last = store.status.lastRunAt ? Date.parse(store.status.lastRunAt) : NaN;
  if (store.target !== target || !(now - last <= STALE_MS)) void startRun();
}

async function run(s: ReturnType<typeof blank>, target: string, opts: RunOptions): Promise<void> {
  const { fetcher = deps.fetcher, runner = deps.runner, pageMs = PAGE_MS, totalMs = TOTAL_MS } = opts;
  const deadline = Date.now() + totalMs;
  const lhrs: unknown[] = [];
  let error: string | undefined;
  try {
    const origin = parseTarget(target)?.origin;
    if (!origin) throw new Error('bad target');
    const pages = await discoverPages(target, fetcher);
    s.status.total = pages.length;
    // One page at a time; a page that fails or times out is skipped, and the total cap keeps what was measured.
    for (const { url } of pages) {
      const left = deadline - Date.now();
      if (left <= 0) break;
      try {
        const lhr = await withTimeout(signal => runner(url, signal), Math.min(pageMs, left));
        if (onOrigin(lhr, origin)) lhrs.push(lhr);
      } catch (e) {
        if ((e as { fatal?: boolean }).fatal) { error = (e as Error).message === NO_CHROME ? NO_CHROME : NOT_INSTALLED; break; }
      }
      s.status.done++;
    }
  } catch {
    error = RUN_FAILED;
  }
  s.target = target;
  s.byPath = parseLighthouse(lhrs);
  s.status = { state: error ? 'error' : 'idle', done: s.status.done, total: s.status.total, lastRunAt: new Date().toISOString(), ...(error ? { error } : {}) };
}
