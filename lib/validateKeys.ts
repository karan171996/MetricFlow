import { SERVER_TOOLS } from '@/lib/analytics';
import type { KeyResult } from '@/lib/analytics';
import { TOOLS, TOOL_IDS } from '@/lib/tools';

export type { KeyResult };
export type SetupInput = Record<string, string>;

/** One read call per source that is present; returns a pass/fail per field, never the values. A source is skipped when its keys are absent. */
export async function validateKeys(input: Partial<SetupInput>): Promise<Record<string, KeyResult>> {
  const checked = await Promise.all(
    TOOL_IDS.map(async id => {
      const keys = TOOLS[id].keys.required;
      if (!keys.every(k => input[k])) return {};
      return (await SERVER_TOOLS[id].update(Object.fromEntries(keys.map(k => [k, input[k]!])))).results;
    })
  );
  return Object.assign({}, ...checked);
}
