import { getTimings } from '@/lib/apiTimingStore';
import { isHosted } from '@/lib/env';

export async function GET() {
  // The timing store is process-wide, so it is never read when METRICFLOW_MODE=hosted.
  if (isHosted()) return Response.json({ items: [] });
  return Response.json({ items: getTimings() });
}
