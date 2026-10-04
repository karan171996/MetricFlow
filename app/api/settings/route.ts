import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isLocalRequest, REFUSAL_MESSAGE } from '@/lib/localRequest';
import { projectDir } from '@/lib/env';
import { DEFAULT_THRESHOLDS, type Thresholds } from '@/lib/thresholds';

// ponytail: single JSON file = one shared config per host. Use a DB/KV on serverless (no persistent disk).
const file = () => process.env.METRICFLOW_SETTINGS_FILE || join(projectDir(), '.metricflow-settings.json');

const RANGES: Record<keyof Thresholds, [number, number]> = {
  loadSeconds: [0.1, 30],
  errorPercent: [0.1, 100],
  uptimeSLA: [90, 100]
};

function load(): Thresholds {
  try {
    return { ...DEFAULT_THRESHOLDS, ...JSON.parse(readFileSync(/*turbopackIgnore: true*/ file(), 'utf8')) };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export async function GET() {
  return Response.json(load());
}

export async function PUT(request: Request) {
  if (!isLocalRequest(request)) return Response.json({ error: REFUSAL_MESSAGE() }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const next = load();
  for (const [k, [min, max]] of Object.entries(RANGES) as [keyof Thresholds, [number, number]][]) {
    if (body[k] === undefined) continue;
    const v = body[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
      return Response.json({ error: `${k} must be a number between ${min} and ${max}.` }, { status: 400 });
    }
    next[k] = v;
  }

  try {
    const tmp = `${file()}.tmp`;
    writeFileSync(/*turbopackIgnore: true*/ tmp, JSON.stringify(next, null, 2));
    renameSync(/*turbopackIgnore: true*/ tmp, /*turbopackIgnore: true*/ file());
  } catch {
    return Response.json({ error: 'Settings could not be written. Check folder permissions.' }, { status: 500 });
  }
  return Response.json(next);
}
