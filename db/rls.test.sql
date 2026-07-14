-- ============================================================================
-- RLS PROOF SCRIPT (BUILD SPEC §7) — a demo asset.
-- Logs in as each role and asserts the FORBIDDEN queries return zero rows.
-- Run AFTER seed:  node scripts/rls-test.mjs   (or paste into the Supabase SQL editor)
--
-- Impersonation: we set the `role` GUC + the `request.jwt.claims` GUC that
-- Supabase's auth.uid() reads, inside a transaction, then ROLLBACK.
-- A failing assertion RAISEs EXCEPTION with a clear message.
-- ============================================================================

-- ── TEST 1 · RTO officer CANNOT read raw telemetry (DoD #7) ──────────────────
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id from profiles where role = 'rto_officer' limit 1),
                      'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
  do $$
  declare n int;
  begin
    select count(*) into n from telemetry;
    if n <> 0 then
      raise exception 'FAIL/T1: rto_officer read % telemetry rows (expected 0 — no RTO telemetry policy exists)', n;
    end if;
    raise notice 'PASS/T1: rto_officer reads 0 telemetry rows (raw breadcrumbs are DB-invisible to RTO)';
  end $$;
rollback;

-- ── TEST 2 · RTO officer CANNOT read trips (only alerts + summary) ───────────
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id from profiles where role = 'rto_officer' limit 1),
                      'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
  do $$
  declare n int;
  begin
    select count(*) into n from trips;
    if n <> 0 then
      raise exception 'FAIL/T2: rto_officer read % trip rows (expected 0)', n;
    end if;
    raise notice 'PASS/T2: rto_officer reads 0 trip rows';
  end $$;
rollback;

-- ── TEST 3 · RTO officer CAN read the summary view (positive control) ────────
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id from profiles where role = 'rto_officer' limit 1),
                      'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
  do $$
  declare n int;
  begin
    select count(*) into n from rto_vehicle_summary;
    if n = 0 then
      raise exception 'FAIL/T3: rto_officer read 0 summary rows (expected > 0 — summary must be visible)';
    end if;
    raise notice 'PASS/T3: rto_officer reads % vehicle-summary rows (aggregates, no location)', n;
  end $$;
rollback;

-- ── TEST 4 · Parent CANNOT scrape telemetry older than the 3-minute tail ─────
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id from profiles where role = 'parent' limit 1),
                      'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
  do $$
  declare n int;
  begin
    -- Any telemetry with server_ts older than 3 minutes must be invisible to a parent.
    select count(*) into n from telemetry where server_ts <= now() - interval '3 minutes';
    if n <> 0 then
      raise exception 'FAIL/T4: parent read % stale telemetry rows (expected 0 — live tail only)', n;
    end if;
    raise notice 'PASS/T4: parent reads 0 stale telemetry rows (live tail only, no history scrape)';
  end $$;
rollback;

-- ── TEST 5 · Parent CANNOT read a non-ACTIVE trip ────────────────────────────
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id from profiles where role = 'parent' limit 1),
                      'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
  do $$
  declare n int;
  begin
    select count(*) into n from trips where status <> 'ACTIVE';
    if n <> 0 then
      raise exception 'FAIL/T5: parent read % non-ACTIVE trips (expected 0)', n;
    end if;
    raise notice 'PASS/T5: parent reads 0 non-ACTIVE trips (map exists only during a live trip)';
  end $$;
rollback;

-- ── TEST 6 · School admin CANNOT read another school''s trips ─────────────────
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub', (select p.id from profiles p where p.role = 'school_admin'
                              order by p.school_id limit 1),
                      'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
  do $$
  declare n int; my_school uuid;
  begin
    select school_id into my_school from profiles
      where id = (current_setting('request.jwt.claims', true)::json ->> 'sub')::uuid;
    select count(*) into n from trips where school_id <> my_school;
    if n <> 0 then
      raise exception 'FAIL/T6: school_admin read % other-school trips (expected 0)', n;
    end if;
    raise notice 'PASS/T6: school_admin sees only its own fleet (0 cross-school trips)';
  end $$;
rollback;

-- All assertions passed if you reached here with only NOTICE PASS lines above.
