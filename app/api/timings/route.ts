import { getTimings } from '@/lib/apiTimingStore';

export async function GET() {
  return Response.json({ items: getTimings() });
}
