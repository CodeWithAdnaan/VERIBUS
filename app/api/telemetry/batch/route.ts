// POST /api/telemetry/batch — idempotent on (trip_id, seq). The SAME endpoint the
// real phone AND the replay harness post to (BUILD SPEC §4, §14).
export const runtime = 'nodejs';

import { batchInput } from '@/lib/zod/schemas';
import { ingestBatch } from '@/lib/server/ingest';
import { ok, err, parseBody } from '@/lib/server/http';

export async function POST(req: Request) {
  const p = await parseBody(batchInput, req);
  if (!p.ok) return p.res;
  try {
    const result = await ingestBatch({
      trip_id: p.data.trip_id,
      fixes: p.data.fixes,
      source: p.data.source,
    });
    return ok(result);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return err(
      status,
      status === 404 ? 'TRIP_NOT_FOUND' : 'INGEST_ERROR',
      (e as Error).message
    );
  }
}
