import { SERVER_TOOLS, type KeyResult, type ToolUpdate } from '@/lib/analytics';
import { EnvWriteRefused, SETUP_KEYS, UNSAFE, connectedTools, env, isToolConnected, writeEnvLocal } from '@/lib/env';
import { KEY_LABELS, TOOLS, TOOL_IDS, type Tool, type ToolId } from '@/lib/tools';
import { isLocalRequest, requireJson, REFUSAL_MESSAGE } from '@/lib/localRequest';

// writeEnvLocal refuses these too; checking here first gives the message under the field.
const UNSAFE_MSG = 'Contains spaces or special characters (# " \' ` $ \\). Paste the value without them.';
// writeEnvLocal's own guard fired on something that got past the checks above (a saved value or a key name). Fixed text: never echo it.
const REFUSED_MSG = 'Nothing was saved: a saved value or a key name was refused as unsafe. Check the saved values, or enter them again here.';

const OPTIONAL_KEYS = TOOL_IDS.flatMap(id => TOOLS[id].keys.optional);

const refuse = () => Response.json({ error: REFUSAL_MESSAGE() }, { status: 403 });
// A tool without a server half has nothing to check: its keys are saved as typed.
const serverHalf = (id: ToolId) => (SERVER_TOOLS as Record<string, { update(values: Record<string, string>): Promise<ToolUpdate> } | undefined>)[id];

/** A write that failed: the guard refusing (400) is told apart from the file system (500). */
const writeFailed = (error: unknown, fsMessage: string) =>
  error instanceof EnvWriteRefused
    ? Response.json({ saved: false, error: REFUSED_MSG }, { status: 400 })
    : Response.json({ saved: false, error: fsMessage }, { status: 500 });

/** Which keys are set. Values are never returned. */
export async function GET(request: Request) {
  if (!isLocalRequest(request)) return refuse();
  return Response.json({
    configured: connectedTools().length > 0,
    tools: connectedTools(),
    keys: Object.fromEntries([...SETUP_KEYS, ...OPTIONAL_KEYS].map(k => [k, Boolean(env(k))]))
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

  // /connect saves only a tool's optional keys (New Relic's Insert key), after the main keys exist.
  const typedOptional = TOOL_IDS.flatMap(id =>
    TOOLS[id].keys.optional.flatMap(k => (typeof body[k] === 'string' && (body[k] as string).trim() ? [{ id, k, v: (body[k] as string).trim() }] : []))
  );
  if (typedOptional.length && SETUP_KEYS.every(k => !body[k])) {
    const results: Record<string, KeyResult> = {};
    const toWrite: Record<string, string> = {};
    for (const id of new Set(typedOptional.map(o => o.id))) {
      if (!isToolConnected(id)) return Response.json({ saved: false, error: 'Finish setup first.' }, { status: 400 });
      const values = Object.fromEntries(typedOptional.filter(o => o.id === id).map(o => [o.k, o.v]));
      const unsafe = Object.entries(values).filter(([, v]) => UNSAFE.test(v));
      for (const [k] of unsafe) results[k] = { ok: false, error: UNSAFE_MSG };
      if (unsafe.length) continue;
      Object.assign(results, (await serverHalf(id)?.update(values))?.results ?? Object.fromEntries(Object.keys(values).map(k => [k, { ok: true }])));
      Object.assign(toWrite, values);
    }
    if (Object.values(results).some(r => !r.ok)) return Response.json({ saved: false, results }, { status: 400 });
    try {
      writeEnvLocal(toWrite);
    } catch (e) {
      return writeFailed(e, '.env.local could not be written. Check folder permissions.');
    }
    return Response.json({ saved: true, results });
  }

  // Each tool is its own optional group: an untouched group is skipped, a half-filled one is rejected, a full one is checked and saved.
  // Only names a tool declares are read from the body; anything else in it is ignored, never written.
  const input: Record<string, string> = {};
  const groupValues: Partial<Record<ToolId, Record<string, string>>> = {};
  const results: Record<string, { ok: false; error: string }> = {};
  for (const id of TOOL_IDS) {
    const keys: readonly string[] = TOOLS[id].keys.required;
    const typed = keys.filter(k => typeof body[k] === 'string' && (body[k] as string).trim());
    if (!typed.length) continue;
    const group: Record<string, string> = (groupValues[id] = {});
    for (const k of typed) {
      const v = (body[k] as string).trim();
      if (UNSAFE.test(v)) results[k] = { ok: false, error: UNSAFE_MSG };
      else input[k] = group[k] = v;
    }
    // A field counts as filled if it was typed or is already saved.
    for (const k of keys.filter(k => !typed.includes(k) && !env(k))) {
      results[k] = { ok: false, error: `Add the ${KEY_LABELS[k]}, or clear the ${KEY_LABELS[typed[0]]} to skip ${TOOLS[id].label}.` };
    }
    for (const k of keys.filter(k => !typed.includes(k) && env(k))) input[k] = group[k] = env(k);
  }
  const touched = Object.keys(groupValues) as ToolId[];
  if (!touched.length) return Response.json({ saved: false, error: 'Fill in both fields for at least one tool.' }, { status: 400 });
  if (Object.keys(results).length) return Response.json({ saved: false, results }, { status: 400 });

  // One read call per touched tool, concurrently. Nothing is written unless every one passes.
  const updates = await Promise.all(touched.map(async id => ({ id, update: await serverHalf(id)?.update(groupValues[id]!) })));
  const checked: Record<string, KeyResult> = Object.assign({}, ...updates.map(u => u.update?.results ?? {}));
  if (Object.values(checked).some(r => !r.ok)) return Response.json({ saved: false, results: checked }, { status: 422 });

  // Only names the tool declares as derived (New Relic's region) are persisted from update().
  const derived = Object.fromEntries(updates.flatMap(({ id, update }) =>
    Object.entries(update?.derived ?? {}).filter(([k]) => (TOOLS[id] as Tool).keys.derived?.includes(k))
  ));
  try {
    writeEnvLocal({ ...input, ...derived });
  } catch (e) {
    return writeFailed(e, 'Keys are valid but .env.local could not be written. Check folder permissions.');
  }
  return Response.json({ saved: true, results: checked });
}
