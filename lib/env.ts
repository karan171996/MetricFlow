import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Key name -> label shown on /setup. Order = form order. */
export const SETUP_KEYS = [
  'NEWRELIC_API_KEY',
  'NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID',
  'SENTRY_API_KEY',
  'SENTRY_ORG_SLUG',
  'SENTRY_PROJECT_ID'
] as const;
export type SetupKey = (typeof SETUP_KEYS)[number];
/** Sends events from your site (Ingest - License key). Not needed to read data; set on /connect. */
export const INSERT_KEY = 'NEWRELIC_INSERT_KEY';

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

export function isConfigured(): boolean {
  return SETUP_KEYS.every(k => env(k));
}

/** METRICFLOW_ENV_FILE overrides the target (used by tests so they never touch a real .env.local). */
export function envFilePath(): string {
  return process.env.METRICFLOW_ENV_FILE || join(process.cwd(), '.env.local');
}

/** Merges `values` into .env.local, keeping unrelated lines, and updates process.env so no restart is needed. */
export function writeEnvLocal(values: Partial<Record<SetupKey | typeof INSERT_KEY | typeof AI_PROVIDER_KEY | (typeof AI_PROVIDERS)[AiProvider]['key'], string>>, path = envFilePath()): void {
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
