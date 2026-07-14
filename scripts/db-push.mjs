// Applies schema.sql then policies.sql to the Supabase Postgres.
//   npm run db:push
import { makeClient, runFile, isMockDbEnabled, ROOT } from './_lib.mjs';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

if (isMockDbEnabled()) {
  console.log('Local fallback active: clearing old PGlite database...');
  rmSync(resolve(ROOT, '.veribus-db-data'), { recursive: true, force: true });
}

const client = makeClient();
try {
  await client.connect();
  console.log('Applying migrations:');
  await runFile(client, 'db/schema.sql');
  await runFile(client, 'db/policies.sql');
  console.log('\n✓ Schema + RLS applied.');
} catch (err) {
  console.error('\n✗ db:push failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
