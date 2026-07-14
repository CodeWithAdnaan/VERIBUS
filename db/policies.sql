-- ============================================================================
-- ROW LEVEL SECURITY (BUILD SPEC §7)
-- The privacy claim must be PROVABLE — enforced in the database, not the UI.
-- Run AFTER schema.sql (npm run db:push runs both).
--
-- ARCHITECTURE NOTE:
--   * Privacy-critical READS (parent live view, RTO summary) use a USER-SCOPED
--     Supabase client, so these policies are the enforcer. db/rls.test.sql proves
--     the negatives (RTO cannot read telemetry; parent cannot read another bus).
--   * All WRITES (ingest, trip lifecycle, alerts, evidence) and operational reads
--     (school board, driver app, admin) use the SERVICE-ROLE client, which bypasses
--     RLS. Those paths do their own authorization in the route/server component.
-- ============================================================================

-- ── helper functions (security definer: read profiles without RLS recursion) ──
create or replace function public.auth_role() returns user_role
  language sql stable security definer set search_path = public as $$
    select role from public.profiles where id = auth.uid()
  $$;

create or replace function public.auth_school() returns uuid
  language sql stable security definer set search_path = public as $$
    select school_id from public.profiles where id = auth.uid()
  $$;

-- ── enable RLS on the four tables the spec names (and only those) ─────────────
-- guardians / guardian_student / consents deliberately keep RLS OFF so the
-- inline parent policy's join chain resolves without SECURITY DEFINER shims.
alter table trips     enable row level security;
alter table telemetry enable row level security;
alter table alerts    enable row level security;
alter table students  enable row level security;

-- students must be visible to the parent policy's join and to the owning school.
create policy parent_own_students on students for select using (
  auth_role() = 'parent'
  and exists (
    select 1 from guardians g
    join guardian_student gs on gs.guardian_id = g.id
    where g.user_id = auth.uid() and gs.student_id = students.id
  )
);
create policy school_own_students on students for select using (
  auth_role() = 'school_admin' and school_id = auth_school()
);

-- ══ THE POLICY THAT IS THE ENTIRE PRIVACY ARGUMENT ══
-- assigned-bus-only  AND  active-trip-only  AND  consent-gated, in one statement.
create policy parent_active_assigned_trip_only on trips for select using (
  auth_role() = 'parent'
  and status = 'ACTIVE'
  and exists (
    select 1 from guardians g
    join guardian_student gs on gs.guardian_id = g.id
    join students s          on s.id = gs.student_id
    join consents c          on c.student_id = s.id and c.guardian_id = g.id
                            and c.granted_at is not null and c.withdrawn_at is null
    where g.user_id = auth.uid()
      and s.assigned_route_id = trips.route_id
  )
);

-- Parents get the LIVE TAIL ONLY. They cannot scrape trip history.
create policy parent_live_tail_only on telemetry for select using (
  auth_role() = 'parent'
  and telemetry.server_ts > now() - interval '3 minutes'
  and exists (select 1 from trips t where t.id = telemetry.trip_id and t.status = 'ACTIVE')
);

create policy school_own_fleet_trips on trips for select using (
  auth_role() = 'school_admin' and school_id = auth_school()
);
create policy school_own_fleet_telemetry on telemetry for select using (
  auth_role() = 'school_admin'
  and exists (select 1 from trips t where t.id = telemetry.trip_id and t.school_id = auth_school())
);

-- ══ RTO HAS **NO** SELECT POLICY ON telemetry. AT ALL. ══
-- The concept note: "RTO view limited to summary/compliance data."
-- We enforce that safeguard IN THE DATABASE, not in the UI.
-- RTO reads: alerts (aggregated metrics for the violation window only)
--            + the rto_vehicle_summary view. Never raw breadcrumbs.
create policy rto_alerts_only on alerts for select using ( auth_role() = 'rto_officer' );

create or replace view rto_vehicle_summary as
  select v.id, v.registration_no, v.bus_code, s.name as school_name, s.district,
         count(a.id) filter (where a.confidence = 'HIGH') as high_conf_alerts_90d,
         v.fitness_expiry, v.permit_expiry, v.insurance_expiry, v.puc_expiry, v.doc_source
  from vehicles v
  join schools s on s.id = v.school_id
  left join alerts a on a.vehicle_id = v.id and a.started_at > now() - interval '90 days'
  group by v.id, s.name, s.district;

create policy driver_own_trip on trips for select using (
  auth_role() = 'driver'
  and exists (select 1 from drivers d where d.id = trips.driver_id and d.user_id = auth.uid())
);

-- ── grants (RLS filters rows, but the role still needs the table privilege) ──
grant usage on schema public to anon, authenticated;
grant select on trips, telemetry, alerts, students to authenticated;
grant select on routes, stops, schools to authenticated;   -- non-PII geometry/labels for the parent map
grant select on rto_vehicle_summary to authenticated;
