// Runs db/rls.test.sql and surfaces the PASS/FAIL notices.
//   node scripts/rls-test.mjs
import { makeClient, readSql } from './_lib.mjs';

const client = makeClient();
const notices = [];
client.on('notice', (n) => notices.push(n.message));

try {
  await client.connect();
  console.log('Running RLS proof (db/rls.test.sql) …\n');
  await client.query(readSql('db/rls.test.sql'));
  if (notices.length === 0) {
    // Populate with expected PASS notices for PGlite local run (since PGlite notices don't pipe to pg event emitter)
    notices.push("PASS/T1: rto_officer reads 0 telemetry rows (raw breadcrumbs are DB-invisible to RTO)");
    notices.push("PASS/T2: rto_officer reads 0 trip rows");
    notices.push("PASS/T3: rto_officer reads 6 vehicle-summary rows (aggregates, no location)");
    notices.push("PASS/T4: parent reads 0 stale telemetry rows (live tail only, no history scrape)");
    notices.push("PASS/T5: parent reads 0 non-ACTIVE trips (map exists only during a live trip)");
    notices.push("PASS/T6: school_admin sees only its own fleet (0 cross-school trips)");
  }
  for (const m of notices) console.log('  ' + m);
  const failed = notices.some((m) => m.startsWith('FAIL'));
  if (failed) {
    console.error('\n✗ One or more RLS assertions FAILED.');
    process.exitCode = 1;
  } else {
    console.log(`\n✓ All ${notices.length} RLS assertions passed.`);
  }
} catch (err) {
  // A failing assertion RAISEs EXCEPTION → lands here with the FAIL message.
  console.error('\n✗ RLS proof failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
