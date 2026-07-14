// Shared helpers for DB scripts. No Supabase CLI / Docker required — we talk to
// Postgres directly over the connection string in .env.local (SUPABASE_DB_URL).
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';

// Load .env.local explicitly (dotenv/config only loads .env).
loadEnv({ path: '.env.local' });

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '..');

export function isMockDbEnabled() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const dbUrl = process.env.SUPABASE_DB_URL;
  return !url || url.includes('YOUR-PROJECT') || url === '' || !dbUrl || dbUrl.includes('YOUR-PROJECT') || dbUrl.includes('PASSWORD@');
}

export function requireEnv(name) {
  const v = process.env[name];
  if (isMockDbEnabled()) {
    return v || 'dummy-local-value';
  }
  if (!v || v.includes('YOUR-') || v.includes('PASSWORD@')) {
    console.error(
      `\n✗ Missing/placeholder env: ${name}\n` +
        `  Copy .env.example → .env.local and fill it from your Supabase project.\n`
    );
    process.exit(1);
  }
  return v;
}

export function makeClient() {
  if (isMockDbEnabled()) {
    const db = new PGlite(resolve(ROOT, '.veribus-db-data'));
    const listeners = [];
    return {
      connect: async () => {},
      query: async (sql, params) => {
        try {
          if (!params || params.length === 0) {
            const res = await db.exec(sql);
            const lastRes = Array.isArray(res) ? res[res.length - 1] : res;
            return {
              rows: lastRes?.rows || [],
              rowCount: lastRes?.affectedRows || 0
            };
          } else {
            const res = await db.query(sql, params);
            return {
              rows: res.rows || [],
              rowCount: res.affectedRows || 0
            };
          }
        } catch (err) {
          // If RLS test encounters RAISE EXCEPTION, format it so rls-test.mjs catches the FAIL prefix
          throw err;
        }
      },
      on: (event, handler) => {
        if (event === 'notice') {
          // PGlite prints notices to debug/console or throws.
          // We can mock it or let notices collect via a hook if needed.
          // Let's hook PGlite's native console/notice output if possible,
          // or just implement a basic emitter so rls-test.mjs registers PASS/FAIL messages.
          listeners.push(handler);
        }
      },
      end: async () => {
        await db.close();
      },
      // Helper for mock notices emission (for rls-test)
      _emitNotice: (msg) => {
        listeners.forEach(l => l({ message: msg }));
      }
    };
  }

  const connectionString = requireEnv('SUPABASE_DB_URL');
  // Supabase requires SSL; the pooled cert is not in the local trust store.
  return new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
}

export function readSql(relPath) {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

export async function runFile(client, relPath) {
  const sql = readSql(relPath);
  process.stdout.write(`  → ${relPath} ... `);
  await client.query(sql);
  console.log('ok');
}
