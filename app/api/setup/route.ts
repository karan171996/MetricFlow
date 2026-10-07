import { INSERT_KEY, REGION_KEY, SETUP_KEYS, UNSAFE, connectedTools, env, isToolConnected, writeEnvLocal } from '@/lib/env';
import { KEY_LABELS, TOOLS, TOOL_IDS } from '@/lib/tools';
import { isLocalRequest, REFUSAL_MESSAGE } from '@/lib/localRequest';
import { validateKeys, type SetupInput } from '@/lib/validateKeys';

// writeEnvLocal refuses these too; checking here first gives the message under the field.
const UNSAFE_MSG = 'Contains spaces or special characters (# " \' ` $ \\). Paste the value without them.';
// An NRAK- User key in an ingest field is the most common setup mistake; a prefix check kills the whole class.
const USER_KEY_MSG = 'That is a User API key (starts NRAK-), which reads data. The Insert key sends data: New Relic > API keys > create key, type "Ingest - License".';

const refuse = () => Response.json({ error: REFUSAL_MESSAGE() }, { status: 403 });

/** Which keys are set. Values are never returned. */
export async function GET(request: Request) {
  if (!isLocalRequest(request)) return refuse();
  return Response.json({
    configured: connectedTools().length > 0,
    tools: connectedTools(),
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
    if (!isToolConnected('new-relic')) return Response.json({ saved: false, error: 'Finish setup first.' }, { status: 400 });
    const bad = UNSAFE.test(insert) ? UNSAFE_MSG : /^NRAK-/i.test(insert) ? USER_KEY_MSG : null;
    if (bad) return Response.json({ saved: false, results: { [INSERT_KEY]: { ok: false, error: bad } } }, { status: 400 });
    try {
      writeEnvLocal({ [INSERT_KEY]: insert });
    } catch {
      return Response.json({ saved: false, error: '.env.local could not be written. Check folder permissions.' }, { status: 500 });
    }
    return Response.json({ saved: true, results: { [INSERT_KEY]: { ok: true } } });
  }

  // Each tool is its own optional group: an untouched group is skipped, a half-filled one is rejected, a full one is checked and saved.
  // Only names a tool declares are read from the body; anything else in it is ignored, never written.
  const input: SetupInput = {};
  const results: Record<string, { ok: false; error: string }> = {};
  let groups = 0;
  for (const id of TOOL_IDS) {
    const keys: readonly string[] = TOOLS[id].keys.required;
    const typed = keys.filter(k => typeof body[k] === 'string' && (body[k] as string).trim());
    if (!typed.length) continue;
    groups++;
    for (const k of typed) {
      const v = (body[k] as string).trim();
      if (UNSAFE.test(v)) results[k] = { ok: false, error: UNSAFE_MSG };
      else input[k] = v;
    }
    // A field counts as filled if it was typed or is already saved.
    for (const k of keys.filter(k => !typed.includes(k) && !env(k))) {
      results[k] = { ok: false, error: `Add the ${KEY_LABELS[k]}, or clear the ${KEY_LABELS[typed[0]]} to skip ${TOOLS[id].label}.` };
    }
    for (const k of keys.filter(k => !typed.includes(k) && env(k))) input[k] = env(k);
  }
  if (!groups) return Response.json({ saved: false, error: 'Fill in both fields for at least one tool.' }, { status: 400 });
  if (Object.keys(results).length) return Response.json({ saved: false, results }, { status: 400 });

  const checked = await validateKeys(input);
  if (Object.values(checked).some(r => !r.ok)) return Response.json({ saved: false, results: checked }, { status: 422 });

  try {
    const nr = checked.NEWRELIC_API_KEY;
    // Region only changes when New Relic was checked in this save; a Sentry-only save must not reset it.
    writeEnvLocal({ ...input, ...(nr ? { [REGION_KEY]: nr.ok && nr.region === 'eu' ? 'eu' : 'us' } : {}) });
  } catch {
    return Response.json({ saved: false, error: 'Keys are valid but .env.local could not be written. Check folder permissions.' }, { status: 500 });
  }
  return Response.json({ saved: true, results: checked });
}
