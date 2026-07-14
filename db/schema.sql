-- ============================================================================
-- School Transport Integrity Platform — SCHEMA (BUILD SPEC §5)
-- Postgres / Supabase. NO PostGIS (geometry math lives in one TS module, §3).
-- Run with:  npm run db:push
-- ============================================================================

-- create extension if not exists pgcrypto;   -- gen_random_uuid() (commented out for local PGlite compatibility; gen_random_uuid() is native in Postgres 13+)

-- Create standard Supabase roles if they don't exist (for local PGlite)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role;
  end if;
end $$;

-- Create mock auth schema and users table for local fallback
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb,
  created_at timestamptz default now()
);

create or replace function auth.uid() returns uuid as $$
  select case
    when nullif(current_setting('request.jwt.claims', true), '') is not null then
      ((current_setting('request.jwt.claims', true))::json ->> 'sub')::uuid
    else
      null
  end;
$$ language sql stable;

-- ── enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type user_role      as enum ('parent','driver','attendant','school_admin','rto_officer','platform_admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type trip_status    as enum ('SCHEDULED','PRE_CHECK','ACTIVE','COMPLETED','ABORTED','MISSED');
exception when duplicate_object then null; end $$;
do $$ begin
  create type trip_direction as enum ('PICKUP','DROP');
exception when duplicate_object then null; end $$;
do $$ begin
  create type alert_type     as enum ('OVERSPEED','LONG_STOP','ROUTE_DEVIATION','DELAY','SIGNAL_LOST','SOS','REPEAT_COMPLAINT','TRIP_NOT_STARTED');
exception when duplicate_object then null; end $$;
do $$ begin
  create type confidence     as enum ('LOW','MEDIUM','HIGH');
exception when duplicate_object then null; end $$;
do $$ begin
  create type alert_status   as enum ('OPEN','ACKNOWLEDGED','RESOLVED','DISMISSED');
exception when duplicate_object then null; end $$;
do $$ begin
  create type fix_quality    as enum ('GOOD','DEGRADED','REJECTED');
exception when duplicate_object then null; end $$;

-- ── identity ────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  school_id uuid,              -- null for rto_officer / platform_admin
  full_name text not null
);

create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district text not null,
  contact_phone text,
  require_attendant boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  registration_no text not null unique,
  bus_code text not null,                 -- human label, e.g. 'BUS-05'
  capacity int not null,
  bind_secret text not null,              -- HMAC key encoded into the in-bus QR sticker
  bind_secret_rotated_at timestamptz not null default now(),
  fitness_expiry date, permit_expiry date, insurance_expiry date, puc_expiry date,
  speed_governor_fitted boolean not null default false,
  doc_source text not null default 'MANUAL_ENTRY',   -- NEVER 'VAHAN'
  active boolean not null default true
);

create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  user_id uuid references auth.users(id),
  full_name text not null, phone text not null,
  licence_no text not null, licence_expiry date,
  active boolean not null default true
);

create table if not exists attendants (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  user_id uuid references auth.users(id),
  full_name text not null, phone text not null, pin_hash text not null,
  active boolean not null default true
);

create table if not exists routes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  name text not null,
  direction trip_direction not null,
  polyline jsonb not null,                -- GeoJSON LineString, uploaded by the team
  corridor_m int not null default 60
);

create table if not exists stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete cascade,
  seq int not null, name text not null,
  lat double precision not null, lng double precision not null,
  scheduled_offset_min int not null,      -- minutes after trip start
  dwell_allowance_sec int not null default 180,
  unique (route_id, seq)
);

-- NOTE: students have NO location column, NO tracking column. By design.
-- The concept note says: "Track the bus, not the child." This is enforced by absence.
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  display_name text not null,             -- first name only
  class_label text,
  assigned_route_id uuid references routes(id),
  assigned_stop_id uuid references stops(id)
);

create table if not exists guardians (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  full_name text not null, phone text not null
);
create table if not exists guardian_student (
  guardian_id uuid references guardians(id) on delete cascade,
  student_id  uuid references students(id)  on delete cascade,
  primary key (guardian_id, student_id)
);

create table if not exists consents (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references guardians(id),
  student_id  uuid not null references students(id),
  notice_version text not null,
  channel text not null default 'APP',    -- 'APP' | 'PAPER'
  granted_at timestamptz,
  withdrawn_at timestamptz
);

create table if not exists trip_schedules (   -- enables TRIP_NOT_STARTED detection
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id),
  vehicle_id uuid not null references vehicles(id),
  driver_id uuid not null references drivers(id),
  attendant_id uuid references attendants(id),
  direction trip_direction not null,
  planned_start_local time not null,
  planned_duration_min int not null,
  days_of_week int[] not null,            -- 1=Mon .. 7=Sun
  grace_minutes int not null default 10,
  active boolean not null default true
);

create table if not exists precheck_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id),
  code text not null,                     -- 'FIRST_AID','FIRE_EXT','DOORS','EMERGENCY_EXIT',
                                          -- 'ATTENDANT_PRESENT','TYRES','BODY_DAMAGE',
                                          -- 'LICENCE_ON_PERSON','GOVERNOR_SEAL'
  label text not null,
  blocking boolean not null default true, -- blocking = trip cannot start if failed
  seq int not null
);

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references trip_schedules(id),
  school_id uuid not null references schools(id),
  route_id uuid not null references routes(id),
  vehicle_id uuid not null references vehicles(id),
  driver_id uuid not null references drivers(id),
  attendant_id uuid references attendants(id),
  direction trip_direction not null,
  status trip_status not null default 'SCHEDULED',
  bind_verified boolean not null default false,
  precheck_passed boolean not null default false,
  attendant_checked_in boolean not null default false,
  planned_start timestamptz, planned_end timestamptz,
  started_at timestamptz, ended_at timestamptz,
  distance_m double precision default 0,
  monitored_seconds int default 0,
  gap_seconds int default 0,              -- honest: time we could not see the bus
  chain_head text,                        -- latest evidence record_hash
  policy_version text                     -- config used to evaluate THIS trip
);

create table if not exists trip_prechecks (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  performed_by uuid not null,
  answers jsonb not null,                 -- [{item_code, ok:boolean, note?}]
  passed boolean not null,
  completed_at timestamptz not null default now()
);

create table if not exists telemetry (
  id bigserial primary key,
  trip_id uuid not null references trips(id) on delete cascade,
  seq int not null,                       -- device-side monotonic sequence
  device_ts timestamptz not null,
  server_ts timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  speed_mps double precision,             -- GPS Doppler ONLY. null is legal.
  heading double precision,
  accuracy_m double precision not null,
  app_state text not null,                -- 'FOREGROUND' | 'BACKGROUND'
  buffered boolean not null default false,-- true = arrived late from IndexedDB
  quality fix_quality not null,
  source text not null default 'DEVICE',  -- 'DEVICE' | 'REPLAY'
  unique (trip_id, seq)
);
create index if not exists telemetry_trip_ts_idx on telemetry (trip_id, device_ts);

create table if not exists heartbeats (
  id bigserial primary key,
  trip_id uuid not null references trips(id) on delete cascade,
  server_ts timestamptz not null default now(),
  app_state text not null,
  gps_permission text not null,           -- 'granted'|'denied'|'prompt'
  has_fix boolean not null,
  battery_pct int
);

-- APPEND-ONLY. Never UPDATE. Never DELETE (except by the retention job, which
-- deletes whole trips, not individual records).
create table if not exists evidence_records (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  seq int not null,
  kind text not null,                     -- 'TRIP_START'|'PRECHECK'|'ALERT'|'SOS'|'TRIP_END'|'COMPLAINT_LINK'|'HARSH_EVENT'|'DRIVER_INTERACTION'
  payload jsonb not null,
  prev_hash text not null,
  record_hash text not null,
  created_at timestamptz not null default now(),
  unique (trip_id, seq)
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references evidence_records(id),
  trip_id uuid not null references trips(id) on delete cascade,
  school_id uuid not null references schools(id),
  vehicle_id uuid not null references vehicles(id),
  driver_id uuid references drivers(id),
  type alert_type not null,
  subtype text,                           -- for SIGNAL_LOST: 'PENDING'|'COVERAGE_GAP'|'SIGNAL_TAMPER'
  severity text not null,                 -- 'INFO'|'WARN'|'CRITICAL'
  confidence confidence not null,
  status alert_status not null default 'OPEN',
  started_at timestamptz not null,
  ended_at timestamptz,
  summary text not null,
  metrics jsonb not null,                 -- see §8 for the required keys per type
  identity_key text not null,             -- stable key so re-evaluation never duplicates
  acknowledged_by uuid, acknowledged_at timestamptz, resolution_note text,
  unique (trip_id, identity_key)
);
create index if not exists alerts_vehicle_started_idx on alerts (vehicle_id, started_at desc);

create table if not exists complaints (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  vehicle_id uuid references vehicles(id),
  trip_id uuid references trips(id),
  raised_by uuid,                         -- null if anonymous
  anonymous boolean not null default false,
  category text,                          -- human-confirmed
  ai_suggested_category text,             -- shown as "AI-suggested — pending review"
  ai_confidence double precision,
  severity text,
  body text not null,
  photo_path text,                        -- Storage; faces blurred CLIENT-SIDE before upload
  cluster_id uuid,
  upheld boolean,                         -- only an upheld complaint deducts score
  status text not null default 'OPEN',
  created_at timestamptz not null default now()
);

create table if not exists policy_config (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,           -- e.g. 'RTO_JK_v1'
  effective_from date not null,
  is_active boolean not null default false,
  rules jsonb not null,                   -- see §6
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists retention_runs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  telemetry_rows_purged int not null,
  trips_purged int not null,
  policy jsonb not null
);

-- ── EXTENSION SEAM (not in §5): school-zone geofences ────────────────────────
-- The policy supports school_zone_limit_kmh, but verified per-road / per-zone
-- speed segments are a PILOT GAP (§2). This table is the seam; it ships EMPTY.
-- Until zones are loaded from a verified departmental source, OVERSPEED uses the
-- default limit only. We never assert a zone limit on our own authority.
create table if not exists school_zones (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) on delete cascade,
  name text not null,
  polygon jsonb not null,                 -- GeoJSON Polygon
  source text not null default 'UNVERIFIED'
);

-- Grant privileges to standard roles for local RLS validation
grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to anon, authenticated, service_role;
grant all privileges on all sequences in schema public to anon, authenticated, service_role;
