// Tiny helpers for JSON API routes + zod validation.
import { NextResponse } from 'next/server';
import type { z } from 'zod';

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function err(status: number, code: string, message: string) {
  return NextResponse.json({ error: code, message }, { status });
}

export async function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  req: Request
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; res: NextResponse }> {
  const body = await req.json().catch(() => null);
  const r = schema.safeParse(body);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return { ok: false, res: err(400, 'BAD_REQUEST', msg) };
  }
  return { ok: true, data: r.data };
}
