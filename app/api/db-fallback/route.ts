import { NextRequest, NextResponse } from 'next/server';
import { getMockDb, getMockSessionClient, getMockDbReady } from '@/lib/supabase/mockDb';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cookieStore = await cookies();
    const userId = cookieStore.get('veribus-auth-token')?.value || null;

    if (body.type === 'auth') {
      if (body.action === 'signInWithPassword') {
        await getMockDbReady();
        const db = getMockDb();
        const res = await db.query(
          'SELECT id, email, raw_user_meta_data FROM auth.users WHERE email = $1',
          [body.email]
        );
        const user = res.rows[0];
        if (!user || body.password !== 'Demo@1234') {
          return NextResponse.json({ data: null, error: { message: 'Invalid credentials' } });
        }
        
        const response = NextResponse.json({
          data: {
            user: { id: user.id, email: user.email, user_metadata: user.raw_user_meta_data },
            session: { access_token: 'mock-token', user_id: user.id }
          },
          error: null
        });

        response.cookies.set('veribus-auth-token', user.id, {
          path: '/',
          maxAge: 86400,
          httpOnly: false
        });
        return response;
      }
      
      if (body.action === 'getUser') {
        const client = getMockSessionClient(userId);
        const res = await client.auth.getUser();
        return NextResponse.json(res);
      }
    }

    if (body.type === 'query') {
      const client = getMockSessionClient(userId);
      let query = client.from(body.table);

      if (body.select) {
        query = query.select(body.select);
      }

      if (body.filters && Array.isArray(body.filters)) {
        for (const f of body.filters) {
          if (f.op === '=') query = query.eq(f.col, f.val);
          else if (f.op === '<>') query = query.neq(f.col, f.val);
          else if (f.op === '>=') query = query.gte(f.col, f.val);
          else if (f.op === '<=') query = query.lte(f.col, f.val);
          else if (f.op === 'IN') query = query.in(f.col, f.val);
        }
      }

      if (body.orderCol) {
        query = query.order(body.orderCol, { ascending: body.orderAsc });
      }

      if (body.limit !== null && body.limit !== undefined) {
        query = query.limit(body.limit);
      }

      if (body.single) {
        query = query.single();
      } else if (body.maybeSingle) {
        query = query.maybeSingle();
      }

      const result = await query;
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unknown request type' }, { status: 400 });
  } catch (err: any) {
    console.error('db-fallback API error:', err);
    return NextResponse.json({ data: null, error: { message: err.message } }, { status: 500 });
  }
}
