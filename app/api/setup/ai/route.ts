import axios from 'axios';
import { AI_PROVIDERS, AI_PROVIDER_KEY, EnvWriteRefused, UNSAFE, activeAi, writeEnvLocal, type AiProvider } from '@/lib/env';
import { isLocalRequest, requireJson, REFUSAL_MESSAGE } from '@/lib/localRequest';

const refuse = () => Response.json({ error: REFUSAL_MESSAGE() }, { status: 403 });

// One free read call per provider (list models) just to prove the key works.
const CHECKS: Record<AiProvider, (key: string) => Promise<unknown>> = {
  gemini: key => axios.get('https://generativelanguage.googleapis.com/v1beta/models', { params: { key }, timeout: 8000 }),
  claude: key =>
    axios.get('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, timeout: 8000 }),
  openai: key => axios.get('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` }, timeout: 8000 })
};

/** Which provider is active and which keys are set. Values are never returned. */
export async function GET(request: Request) {
  if (!isLocalRequest(request)) return refuse();
  return Response.json({
    provider: activeAi()?.provider ?? null,
    keys: Object.fromEntries(Object.entries(AI_PROVIDERS).map(([p, v]) => [p, Boolean(process.env[v.key])]))
  });
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) return refuse();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const notJson = requireJson(request);
  if (notJson) return notJson;

  const provider = body.provider as AiProvider;
  if (!(typeof provider === 'string' && provider in AI_PROVIDERS)) {
    return Response.json({ saved: false, error: 'Choose a provider.' }, { status: 400 });
  }
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!key) return Response.json({ saved: false, error: 'Required.' }, { status: 400 });
  if (UNSAFE.test(key)) {
    return Response.json({ saved: false, error: 'Contains spaces or special characters. Paste the key without them.' }, { status: 400 });
  }

  try {
    await CHECKS[provider](key);
  } catch (e) {
    // Never echo the thrown axios error: its config carries the key.
    const status = axios.isAxiosError(e) ? e.response?.status : undefined;
    const error =
      status === 400 || status === 401 || status === 403
        ? `${AI_PROVIDERS[provider].label} rejected this key.`
        : `Could not reach ${AI_PROVIDERS[provider].label} to check the key.`;
    return Response.json({ saved: false, error }, { status: 422 });
  }

  try {
    writeEnvLocal({ [AI_PROVIDER_KEY]: provider, [AI_PROVIDERS[provider].key]: key });
  } catch (e) {
    // The guard refusing is told apart from the file system failing; neither echoes the key.
    if (e instanceof EnvWriteRefused) return Response.json({ saved: false, error: 'Nothing was saved: the key or its name was refused as unsafe.' }, { status: 400 });
    return Response.json({ saved: false, error: 'Key is valid but .env.local could not be written. Check folder permissions.' }, { status: 500 });
  }
  return Response.json({ saved: true, provider });
}
