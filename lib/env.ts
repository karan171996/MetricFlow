import 'server-only';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOOLS, TOOL_IDS, type Tool, type ToolId } from '@/lib/tools';

/** Every tool's required keys, in TOOLS order = form order on /setup. */
export const SETUP_KEYS: readonly string[] = TOOL_IDS.flatMap(id => TOOLS[id].keys.required);
/** Sends events from your site (Ingest - License key). Not needed to read data; set on /connect. */
export const INSERT_KEY = 'NEWRELIC_INSERT_KEY';
/** 'eu' for EU data-centre accounts; anything else = US. Auto-detected on /setup. */
export const REGION_KEY = 'NEWRELIC_REGION';

const NR_HOSTS = {
  us: { graphql: 'https://api.newrelic.com/graphql', ingest: 'https://insights-collector.newrelic.com' },
  eu: { graphql: 'https://api.eu.newrelic.com/graphql', ingest: 'https://insights-collector.eu01.nr-data.net' }
} as const;
export type NrRegion = keyof typeof NR_HOSTS;
export const nrHosts = (region: NrRegion = process.env[REGION_KEY] === 'eu' ? 'eu' : 'us') => NR_HOSTS[region];

/** Optional AI provider for suggestions. Key = env var holding that provider's API key. */
export const AI_PROVIDERS = {
  gemini: { label: 'Google Gemini', key: 'GEMINI_API_KEY' },
  claude: { label: 'Anthropic Claude', key: 'CLAUDE_API_KEY' },
  openai: { label: 'OpenAI', key: 'OPENAI_API_KEY' }
} as const;
export type AiProvider = keyof typeof AI_PROVIDERS;
export const AI_PROVIDER_KEY = 'AI_PROVIDER';

/** The chosen provider if its key is set, else the first provider that has a key. */
export function activeAi(): { provider: AiProvider; key: string } | null {
  const chosen = process.env[AI_PROVIDER_KEY] as AiProvider | undefined;
  const order = (chosen && chosen in AI_PROVIDERS ? [chosen] : []).concat(Object.keys(AI_PROVIDERS) as AiProvider[]);
  for (const provider of order) {
    const key = process.env[AI_PROVIDERS[provider].key];
    if (key) return { provider, key };
  }
  return null;
}

/**
 * Computed-key read: Next inlines literal `process.env.NEXT_PUBLIC_*` at build
 * time, which would freeze the account id before /setup could write it.
 */
export function env(name: string): string {
  return process.env[name] ?? '';
}

/** A tool is connected when all its required keys are set. Nothing else decides it. */
export const isToolConnected = (id: ToolId): boolean => TOOLS[id].keys.required.every(k => env(k));
export const connectedTools = (): ToolId[] => TOOL_IDS.filter(isToolConnected);
/** True when at least one tool is connected. */
export const isConfigured = (): boolean => connectedTools().length > 0;

/**
 * The folder the user ran the CLI in. The server's own cwd is the installed
 * package, so writes keyed off cwd would land in node_modules (or the npx
 * cache) instead of the user's project - and ship their keys with the package.
 */
export function projectDir(): string {
  return process.env.METRICFLOW_PROJECT_DIR || process.cwd();
}

/** METRICFLOW_ENV_FILE overrides the target (used by tests so they never touch a real .env.local). */
export function envFilePath(): string {
  return process.env.METRICFLOW_ENV_FILE || join(projectDir(), '.env.local');
}

/** Values are written unquoted to .env.local, so anything a dotenv parser treats specially is rejected. */
export const UNSAFE = /[\s\0#"'`\\$]/;

/** Every name writeEnvLocal may write: each tool's declared keys, and the AI keys. Nothing else. */
const writableKeys = (): Set<string> =>
  new Set([
    ...Object.values<Tool>(TOOLS).flatMap(t => [...t.keys.required, ...t.keys.optional, ...(t.keys.derived ?? [])]),
    ...Object.values(AI_PROVIDERS).map(p => p.key),
    AI_PROVIDER_KEY
  ]);

/** writeEnvLocal's own refusal (unsafe value, undeclared name), told apart from a file-system failure. */
export class EnvWriteRefused extends Error {}

/**
 * Merges `values` into .env.local, keeping unrelated lines, and updates process.env so no restart is needed.
 * The single writer is also the guard: an undeclared name or an unsafe value throws before the file is opened.
 */
export function writeEnvLocal(values: Record<string, string>, path = envFilePath()): void {
  const allowed = writableKeys();
  for (const [name, v] of Object.entries(values)) {
    // Fixed text: the name or value could be something a caller should not echo.
    if (!allowed.has(name)) throw new EnvWriteRefused('Refused to write a key name no tool declares.');
    if (UNSAFE.test(v)) throw new EnvWriteRefused('Refused to write a value with unsafe characters.');
  }
  const existing = existsSync(path) ? readFileSync(path, 'utf8').split('\n') : [];
  const pending = new Map(Object.entries(values));
  const lines = existing.map(line => {
    const name = line.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1];
    if (name && pending.has(name)) {
      const v = pending.get(name)!;
      pending.delete(name);
      return `${name}=${v}`;
    }
    return line;
  });
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  for (const [name, v] of pending) lines.push(`${name}=${v}`);

  const tmp = `${path}.tmp`;
  writeFileSync(tmp, lines.join('\n') + '\n', { mode: 0o600 });
  renameSync(tmp, path);
  for (const [name, v] of Object.entries(values)) process.env[name] = v;
}
