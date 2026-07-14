// Wipes only the RUNTIME tables (trips + everything downstream) and leaves the
// fleet / roster / policy intact. Run between rehearsals.
//   npm run demo:reset
import { makeClient } from './_lib.mjs';

const RUNTIME_TABLES = [
  'trips', 'telemetry', 'heartbeats', 'evidence_records', 'alerts',
  'complaints', 'trip_prechecks', 'retention_runs',
];

const client = makeClient();
try {
  await client.connect();
  console.log('Wiping runtime tables (trips/telemetry/alerts/evidence/…) …');
  await client.query(`truncate ${RUNTIME_TABLES.join(', ')} restart identity cascade;`);
  console.log('✓ Demo reset. Fleet, roster, schedules and policy are preserved.');
  console.log('  (Run `npm run db:seed` if you also need to rebuild the roster.)');
} catch (err) {
  console.error('✗ demo:reset failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
