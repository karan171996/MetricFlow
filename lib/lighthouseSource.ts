import 'server-only';
import { BlockList, isIP } from 'node:net';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { projectDir } from '@/lib/env';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 200;
const MAX_HOPS = 3;
const TIMEOUT_MS = 10_000;

/** Why a load failed. Setup maps it to fixed text; the error itself never carries the spec, a file name, a parse error, a body or an address. */
export type LoadReason = 'blocked' | 'notFound' | 'notJsonFile' | 'tooLarge' | 'timeout' | 'notJson' | 'unreadable';
const loadError = (reason: LoadReason) => Object.assign(new Error('Could not read the Lighthouse report.'), { reason });
const fail = (reason: LoadReason = 'unreadable'): never => { throw loadError(reason); };
/** An fs call whose failure (missing, no permission, broken link) is reported as notFound, never as the OS message. */
const fsTry = async <T>(p: Promise<T>): Promise<T> => { try { return await p; } catch { return fail('notFound'); } };

const blocked = new BlockList();
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['192.88.99.0', 24], ['192.0.2.0', 24], ['198.51.100.0', 24], ['203.0.113.0', 24], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blocked.addSubnet(a, p, 'ipv4');
for (const [a, p] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['fec0::', 10], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['2002::', 16], ['::', 96], ['::ffff:0:0:0', 96]] as const) blocked.addSubnet(a, p, 'ipv6');

/** True when the address is private/special. ponytail: NAT64, 6to4, ::/96 and SIIT ranges are blocked whole (no embedded-IPv4 extraction), so a public IPv4 behind them is refused too; fine for a report host. IPv4-mapped IPv6 (::ffff:a.b.c.d or ::ffff:hhhh:hhhh) is judged by its embedded IPv4. */
export function isBlockedAddress(addr: string): boolean {
  const family = isIP(addr);
  if (!family) return true;
  if (family === 4) return blocked.check(addr, 'ipv4');
  const m = /^::ffff:(.+)$/i.exec(addr);
  if (m) {
    const rest = m[1];
    if (isIP(rest) === 4) return blocked.check(rest, 'ipv4');
    const h = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(rest);
    if (!h) return true;
    const hi = parseInt(h[1], 16), lo = parseInt(h[2], 16);
    return blocked.check(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, 'ipv4');
  }
  return blocked.check(addr, 'ipv6');
}

type Lookup = (host: string) => Promise<{ address: string; family: number }[]>;
const systemLookup: Lookup = host => dns.promises.lookup(host, { all: true });

/** Every address must pass; the connection then uses one of those same addresses, so DNS cannot change between check and connect. */
function guardedLookup(lookup: Lookup) {
  return (host: string, opts: { all?: boolean }, cb: (...a: unknown[]) => void) => {
    lookup(host).then(addrs => {
      if (!addrs.length || addrs.some(a => isBlockedAddress(a.address))) return cb(loadError('blocked'));
      if (opts.all) cb(null, addrs);
      else cb(null, addrs[0].address, addrs[0].family);
    }, err => cb(err));
  };
}

function getOnce(url: URL, lookup: Lookup, deadline: number): Promise<{ status: number; location?: string; body?: string }> {
  return new Promise((resolveP, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const req = lib.request({
      protocol: url.protocol, host, port: url.port || undefined, path: url.pathname + url.search, method: 'GET',
      headers: { 'accept-encoding': 'identity', accept: 'application/json' },
      lookup: guardedLookup(lookup) as never, agent: false, timeout: Math.max(1, deadline - Date.now())
    }, res => {
      const status = res.statusCode ?? 0;
      // The redirect body is never used: drop the socket rather than drain it.
      if (status >= 300 && status < 400) { res.destroy(); return resolveP({ status, location: res.headers.location }); }
      if (status !== 200) { res.destroy(); return reject(loadError('unreadable')); }
      const type = String(res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (type !== 'application/json' && !type.endsWith('+json')) { res.destroy(); return reject(loadError('notJson')); }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_BYTES) { req.destroy(); return reject(loadError('tooLarge')); }
        chunks.push(c);
      });
      res.on('end', () => resolveP({ status, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    const timer = setTimeout(() => req.destroy(loadError('timeout')), Math.max(1, deadline - Date.now()));
    req.on('timeout', () => req.destroy(loadError('timeout')));
    req.on('error', reject);
    req.on('close', () => clearTimeout(timer));
    req.end();
  });
}

function checkUrl(u: URL): void {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') fail('blocked');
  if (u.username || u.password) fail('blocked');
  const port = u.port || (u.protocol === 'https:' ? '443' : '80');
  if (port !== '80' && port !== '443') fail('blocked');
  const lit = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(lit) && isBlockedAddress(lit)) fail('blocked');
}

/** Exported with an injectable lookup so tests need no network. */
export async function fetchJson(spec: string, lookup: Lookup = systemLookup): Promise<unknown> {
  const deadline = Date.now() + TIMEOUT_MS;
  let url: URL;
  try { url = new URL(spec); } catch { return fail(); }
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    checkUrl(url);
    const res = await getOnce(url, lookup, deadline);
    if (res.body !== undefined) {
      try { return JSON.parse(res.body); } catch { return fail('notJson'); }
    }
    if (!res.location) fail();
    try { url = new URL(res.location!, url); } catch { return fail(); }
  }
  return fail();
}

async function readJsonFile(path: string, budget?: { left: number }): Promise<unknown> {
  const s = await fsTry(stat(path));
  if (!s.isFile()) fail('notFound');
  if (s.size > MAX_BYTES) fail('tooLarge');
  const buf = await fsTry(readFile(path));
  // Checked again on what was read: a file that grew after stat cannot pass the caps.
  if (buf.length > MAX_BYTES) fail('tooLarge');
  if (budget && (budget.left -= buf.length) < 0) fail('tooLarge');
  try { return JSON.parse(buf.toString('utf8')); } catch { return fail('notJson'); }
}

async function readPath(spec: string): Promise<unknown> {
  const real = await fsTry(realpath(resolve(projectDir(), spec)));
  const s = await fsTry(stat(real));
  if (s.isDirectory()) {
    const names = (await fsTry(readdir(real))).filter(n => extname(n).toLowerCase() === '.json').sort();
    if (names.length > MAX_FILES) fail('tooLarge');
    const out: unknown[] = [];
    const budget = { left: MAX_TOTAL_BYTES };
    for (const n of names) {
      let file: string;
      try { file = await realpath(join(real, n)); const fs = await stat(file); if (!fs.isFile()) continue; } catch { continue; }
      out.push(await readJsonFile(file, budget));
    }
    return out;
  }
  if (extname(real).toLowerCase() !== '.json') fail('notJsonFile');
  return readJsonFile(real);
}

/** A URL, or a path (file or folder) under the project: the Lighthouse JSON reports as parsed JSON. Throws an error with a `reason`. */
export async function loadReports(spec: string, lookup?: Lookup): Promise<unknown> {
  try {
    if (/^https?:\/\//i.test(spec)) return await fetchJson(spec, lookup);
    if (/^[a-z][a-z0-9+.-]+:/i.test(spec)) return fail('blocked');
    return await readPath(spec);
  } catch (e) {
    // Our own errors keep their reason; anything else (DNS, socket, OS) becomes the generic one, its message dropped.
    const reason = (e as { reason?: LoadReason }).reason;
    return fail(reason ?? 'unreadable');
  }
}
