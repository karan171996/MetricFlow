import { INSERT_KEY, REGION_KEY, SETUP_KEYS, env, isConfigured, writeEnvLocal, type SetupKey } from '@/lib/env';
import { isLocalRequest, REFUSAL_MESSAGE } from '@/lib/localRequest';
import { validateKeys, type SetupInput } from '@/lib/validateKeys';

// Values are written unquoted to .env.local, so anything a dotenv parser treats specially is rejected.
const UNSAFE = /[\s\0#"'`\\$]/;
const UNSAFE_MSG = 'Contains spaces or special characters (# " \' ` $ \\). Paste the value without them.';
// An NRAK- User key in an ingest field is the most common setup mistake; a prefix check kills the whole class.
const USER_KEY_MSG = 'That is a User API key (starts NRAK-), which reads data. The Insert key sends data: New Relic > API keys > create key, type "Ingest - License".';

const refuse = () => Response.json({ error: REFUSAL_MESSAGE() }, { status: 403 });

/** Which keys are set. Values are never returned. */
export async function GET(request: Request) {
  if (!isLocalRequest(request)) return refuse();
  return Response.json({
    configured: isConfigured(),
    keys: Object.fromEntries([...SETUP_KEYS, INSERT_KEY].map(k => [k, Boolean(env(k))]))
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

  // /connect saves only the optional Insert key, after the main keys exist.
  const insert = typeof body[INSERT_KEY] === 'string' ? (body[INSERT_KEY] as string).trim() : '';
  if (insert && SETUP_KEYS.every(k => !body[k])) {
    if (!isConfigured()) return Response.json({ saved: false, error: 'Finish setup first.' }, { status: 400 });
    const bad = UNSAFE.test(insert) ? UNSAFE_MSG : /^NRAK-/i.test(insert) ? USER_KEY_MSG : null;
    if (bad) return Response.json({ saved: false, results: { [INSERT_KEY]: { ok: false, error: bad } } }, { status: 400 });
    try {
      writeEnvLocal({ [INSERT_KEY]: insert });
    } catch {
      return Response.json({ saved: false, error: '.env.local could not be written. Check folder permissions.' }, { status: 500 });
    }
    return Response.json({ saved: true, results: { [INSERT_KEY]: { ok: true } } });
  }

  const input = {} as SetupInput;
  const results: Record<string, { ok: false; error: string }> = {};
  for (const k of SETUP_KEYS) {
    const v = typeof body[k] === 'string' ? (body[k] as string).trim() : '';
    if (!v) results[k] = { ok: false, error: 'Required.' };
    else if (UNSAFE.test(v)) results[k] = { ok: false, error: UNSAFE_MSG };
    else input[k as SetupKey] = v;
  }
  if (Object.keys(results).length) return Response.json({ saved: false, results }, { status: 400 });

  const checked = await validateKeys(input);
  if (Object.values(checked).some(r => !r.ok)) return Response.json({ saved: false, results: checked }, { status: 422 });

  try {
    const nr = checked.NEWRELIC_API_KEY;
    writeEnvLocal({ ...input, [REGION_KEY]: nr.ok && nr.region === 'eu' ? 'eu' : 'us' });
  } catch {
    return Response.json({ saved: false, error: 'Keys are valid but .env.local could not be written. Check folder permissions.' }, { status: 500 });
  }
  return Response.json({ saved: true, results: checked });
}
