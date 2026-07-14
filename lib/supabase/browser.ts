// Browser client for client components (login, driver PWA, replay harness).
'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMockDbEnabled } from './dbConfig';

class MockBrowserQueryBuilder {
  private table: string;
  private selectCols: string = '*';
  private originalSelectCols: string = '*';
  private filters: any[] = [];
  private orderCol: string | null = null;
  private orderAsc: boolean = true;
  private limitVal: number | null = null;
  private isSingle = false;
  private isMaybeSingle = false;

  constructor(table: string) {
    this.table = table;
  }

  select(cols: string = '*') {
    this.originalSelectCols = cols;
    this.selectCols = cols;
    return this;
  }

  eq(col: string, val: any) {
    this.filters.push({ col, op: '=', val });
    return this;
  }

  neq(col: string, val: any) {
    this.filters.push({ col, op: '<>', val });
    return this;
  }

  gte(col: string, val: any) {
    this.filters.push({ col, op: '>=', val });
    return this;
  }

  lte(col: string, val: any) {
    this.filters.push({ col, op: '<=', val });
    return this;
  }

  in(col: string, vals: any[]) {
    this.filters.push({ col, op: 'IN', val: vals });
    return this;
  }

  order(col: string, options?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = options?.ascending !== false;
    return this;
  }

  limit(val: number) {
    this.limitVal = val;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  async execute() {
    const res = await fetch('/api/db-fallback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'query',
        table: this.table,
        select: this.originalSelectCols,
        filters: this.filters,
        orderCol: this.orderCol,
        orderAsc: this.orderAsc,
        limit: this.limitVal,
        single: this.isSingle,
        maybeSingle: this.isMaybeSingle
      })
    });
    return res.json();
  }

  async then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    try {
      const result = await this.execute();
      if (onfulfilled) return onfulfilled(result);
      return result;
    } catch (err: any) {
      const result = { data: null, error: { message: err.message } };
      if (onfulfilled) return onfulfilled(result);
      return result;
    }
  }
}

let cached: any | null = null;

export function browserClient(): SupabaseClient {
  if (isMockDbEnabled()) {
    return {
      from(table: string) {
        return new MockBrowserQueryBuilder(table);
      },
      auth: {
        async signInWithPassword({ email, password }) {
          const res = await fetch('/api/db-fallback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'auth',
              action: 'signInWithPassword',
              email,
              password
            })
          });
          const result = await res.json();
          if (!result.error && result.data?.user) {
            document.cookie = `veribus-auth-token=${result.data.user.id}; path=/; max-age=86400`;
          }
          return result;
        },
        async getUser() {
          const res = await fetch('/api/db-fallback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'auth',
              action: 'getUser'
            })
          });
          return res.json();
        }
      }
    } as any;
  }

  if (cached) return cached;
  cached = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return cached;
}
