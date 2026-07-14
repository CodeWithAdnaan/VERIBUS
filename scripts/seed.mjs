// Seeds the database: backbone (db/seed.sql) + geojson route patch + bulk roster
// + Supabase auth users. Idempotent — truncates domain tables first.
//   npm run db:seed
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { makeClient, readSql, requireEnv, ROOT, isMockDbEnabled } from './_lib.mjs';
import crypto from 'node:crypto';

const SCHOOL_A = '0a5c0001-0000-4000-8000-000000000001';
const SCHOOL_B = '0a5c0002-0000-4000-8000-000000000002';
const ROUTE_A = '0a0c0001-0000-4000-8000-0000000000a1';
const ROUTE_B = '0a0c0002-0000-4000-8000-0000000000a2';
const ROUTE_C = '0a0c0003-0000-4000-8000-0000000000c3';
const DRIVER_1 = '0d110001-0000-4000-8000-000000000001';
const GUARDIAN_DEMO = '09110001-0000-4000-8000-0000000000d1';

const DOMAIN_TABLES = [
  'schools', 'vehicles', 'drivers', 'attendants', 'routes', 'stops', 'students',
  'guardians', 'guardian_student', 'consents', 'trip_schedules', 'precheck_items',
  'policy_config', 'school_zones', 'trips', 'telemetry', 'heartbeats',
  'evidence_records', 'alerts', 'complaints', 'trip_prechecks', 'retention_runs',
  'profiles',
];

// Demo logins (also written to DEMO.md). Password is deliberately weak — pilot only.
const DEMO_USERS = [
  { email: 'rto@demo.gov.in',      role: 'rto_officer',  school_id: null,     full_name: 'RTO Officer (Srinagar)' },
  { email: 'schoolA@demo.gov.in',  role: 'school_admin', school_id: SCHOOL_A, full_name: 'Valley Public — Admin' },
  { email: 'schoolB@demo.gov.in',  role: 'school_admin', school_id: SCHOOL_B, full_name: 'Dal Lake Convent — Admin' },
  { email: 'driver1@demo.gov.in',  role: 'driver',       school_id: SCHOOL_A, full_name: 'Bashir Ahmad', link: { table: 'drivers', id: DRIVER_1 } },
  { email: 'parent@demo.gov.in',   role: 'parent',       school_id: null,     full_name: 'Aisha Parent', link: { table: 'guardians', id: GUARDIAN_DEMO } },
];
const DEMO_PASSWORD = 'Demo@1234';

function geometryFromGeojson(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  if (raw.type === 'FeatureCollection') return raw.features[0].geometry;
  if (raw.type === 'Feature') return raw.geometry;
  return raw; // bare geometry
}

async function ensureAuthUser(admin, email, password, meta) {
  // createUser fails if the email exists; fall back to looking it up.
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: meta,
  });
  if (!error && data?.user) return data.user.id;

  // Already exists → find it (single page is fine for a pilot project).
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = list?.users?.find((u) => u.email === email);
  if (found) {
    await admin.auth.admin.updateUserById(found.id, { password, user_metadata: meta });
    return found.id;
  }
  throw new Error(`Could not create or find auth user ${email}: ${error?.message}`);
}

const pgc = makeClient();
try {
  await pgc.connect();

  console.log('Truncating domain tables …');
  await pgc.query(`truncate ${DOMAIN_TABLES.join(', ')} restart identity cascade;`);

  console.log('Loading backbone (db/seed.sql) …');
  await pgc.query(readSql('db/seed.sql'));

  console.log('Loading demo dataset (db/seed_demo.sql) — live trips, alerts, telemetry …');
  await pgc.query(readSql('db/seed_demo.sql'));

  console.log('Patching route polylines from /seed/routes/*.geojson …');
  for (const [id, file] of [
    [ROUTE_A, 'route_a.geojson'],
    [ROUTE_B, 'route_b.geojson'],
    [ROUTE_C, 'route_c.geojson'],
  ]) {
    const path = resolve(ROOT, 'seed/routes', file);
    if (!existsSync(path)) { console.log(`  (skip ${file} — not found)`); continue; }
    const geom = geometryFromGeojson(path);
    await pgc.query('update routes set polyline = $1 where id = $2', [geom, id]);
    console.log(`  → ${file} → ${id.slice(0, 8)}…`);
  }

  console.log('Seeding bulk roster (40 students / 30 guardians / consents) …');
  // Demo backbone already added 1 student + 1 guardian + 1 consent. Add the rest.
  const routesForSchoolA = [ROUTE_A, ROUTE_B];
  for (let i = 1; i <= 29; i++) {
    const onA = i % 3 !== 0; // ~2/3 on school A so the demo parent's school is busy
    const school = onA ? SCHOOL_A : SCHOOL_B;
    const route = onA ? routesForSchoolA[i % 2] : ROUTE_C;
    const g = await pgc.query(
      'insert into guardians (full_name, phone) values ($1,$2) returning id',
      [`Guardian ${i}`, `+91-98000-${String(1000 + i).padStart(5, '0')}`]
    );
    const s = await pgc.query(
      `insert into students (school_id, display_name, class_label, assigned_route_id)
       values ($1,$2,$3,$4) returning id`,
      [school, `Student ${i}`, `Class ${(i % 8) + 1}`, route]
    );
    await pgc.query(
      'insert into guardian_student (guardian_id, student_id) values ($1,$2)',
      [g.rows[0].id, s.rows[0].id]
    );
    // Two consents withdrawn to demonstrate revocation; the rest granted.
    const withdrawn = i === 7 || i === 15;
    await pgc.query(
      `insert into consents (guardian_id, student_id, notice_version, channel, granted_at, withdrawn_at)
       values ($1,$2,'NOTICE_v1','APP', now(), $3)`,
      [g.rows[0].id, s.rows[0].id, withdrawn ? new Date().toISOString() : null]
    );
  }
  // Top up to 40 students total (1 demo + 29 = 30 → add 10 unlinked).
  for (let i = 30; i <= 39; i++) {
    await pgc.query(
      `insert into students (school_id, display_name, class_label, assigned_route_id)
       values ($1,$2,$3,$4)`,
      [SCHOOL_A, `Student ${i}`, `Class ${(i % 8) + 1}`, i % 2 ? ROUTE_A : ROUTE_B]
    );
  }

  console.log('Creating Supabase auth users + profiles …');
  let admin;
  if (isMockDbEnabled()) {
    admin = {
      auth: {
        admin: {
          async createUser({ email, password, user_metadata }) {
            const existing = await pgc.query('SELECT id FROM auth.users WHERE email = $1', [email]);
            if (existing.rows.length > 0) {
              return { data: { user: { id: existing.rows[0].id } }, error: null };
            }
            const id = crypto.randomUUID();
            await pgc.query(
              'INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3)',
              [id, email, JSON.stringify(user_metadata)]
            );
            return { data: { user: { id, email, user_metadata } }, error: null };
          },
          async listUsers() {
            const res = await pgc.query('SELECT id, email, raw_user_meta_data FROM auth.users');
            const users = res.rows.map(r => ({
              id: r.id,
              email: r.email,
              user_metadata: r.raw_user_meta_data
            }));
            return { data: { users }, error: null };
          },
          async updateUserById(id, { user_metadata }) {
            await pgc.query(
              'UPDATE auth.users SET raw_user_meta_data = $1 WHERE id = $2',
              [JSON.stringify(user_metadata), id]
            );
            return { data: { user: { id } }, error: null };
          }
        }
      }
    };
  } else {
    const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
    const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  }

  for (const u of DEMO_USERS) {
    const uid = await ensureAuthUser(admin, u.email, DEMO_PASSWORD, { role: u.role });
    await pgc.query(
      `insert into profiles (id, role, school_id, full_name) values ($1,$2,$3,$4)
       on conflict (id) do update set role=excluded.role, school_id=excluded.school_id, full_name=excluded.full_name`,
      [uid, u.role, u.school_id, u.full_name]
    );
    if (u.link) {
      await pgc.query(`update ${u.link.table} set user_id = $1 where id = $2`, [uid, u.link.id]);
    }
    console.log(`  → ${u.email.padEnd(22)} (${u.role})`);
  }

  console.log('\n✓ Seed complete.  Demo password for all: ' + DEMO_PASSWORD);
} catch (err) {
  console.error('\n✗ db:seed failed:', err.message);
  console.error(err);
  process.exitCode = 1;
} finally {
  await pgc.end();
}
