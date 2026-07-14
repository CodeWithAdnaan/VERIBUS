-- ============================================================================
-- DEMO DATASET — live trips + alerts + evidence + telemetry + complaints.
-- Loaded by scripts/seed.mjs after the backbone (db/seed.sql). Everything here is
-- dated relative to now()/current_date so the boards always have "today" data:
--   * Driver (Bashir / driver1)  → trips assigned today (Live / Pre-check / Scheduled)
--   * School A board             → active trips + open critical alert
--   * Parent (Aisha → Zoya)      → an ACTIVE trip on Zoya's Route A + live tail
--   * RTO                        → HIGH-confidence alerts + score variation
--
-- All coordinates are SYNTHETIC (near Srinagar), consistent with db/seed.sql.
-- Evidence hashes on the completed trips are illustrative placeholders — they host
-- the alert FKs only; the active trips carry NO evidence so their chain reads VALID.
-- ============================================================================

-- Stable ids ----------------------------------------------------------------
-- schools:  A=0a5c0001…01  B=0a5c0002…02
-- routes:   A=0a0c0001…a1  B=0a0c0002…a2  C=0a0c0003…c3
-- vehicles: BUS-01=0e100001  BUS-02=0e100002  BUS-03=0e100003  BUS-05=0e100005
-- drivers:  Bashir=0d110001  Gulzar=0d110002  Manzoor=0d110005  Farooq=0d110003
-- attendants: 0a770001 (A) 0a770003 (B)
-- demo student Zoya=05100001 on Route A; demo guardian Aisha=09110001

-- ── TRIPS ────────────────────────────────────────────────────────────────────
insert into trips (id, school_id, route_id, vehicle_id, driver_id, attendant_id, direction,
                   status, bind_verified, precheck_passed, attendant_checked_in,
                   planned_start, planned_end, started_at, policy_version) values
  -- T1 — ACTIVE on Route A (Zoya's route). The parent's live trip + on the school board.
  ('0c000001-0000-4000-8000-000000000001','0a5c0001-0000-4000-8000-000000000001','0a0c0001-0000-4000-8000-0000000000a1','0e100005-0000-4000-8000-000000000005','0d110001-0000-4000-8000-000000000001','0a770001-0000-4000-8000-000000000001','PICKUP',
   'ACTIVE', true, true, true, current_date + time '07:30', current_date + time '08:05', now() - interval '5 minutes','RTO_JK_v1'),
  -- T4 — ACTIVE on Route B, second bus on the school board (different driver).
  ('0c000004-0000-4000-8000-000000000004','0a5c0001-0000-4000-8000-000000000001','0a0c0002-0000-4000-8000-0000000000a2','0e100002-0000-4000-8000-000000000002','0d110002-0000-4000-8000-000000000002','0a770002-0000-4000-8000-000000000002','DROP',
   'ACTIVE', true, true, true, current_date + time '07:40', current_date + time '08:10', now() - interval '25 minutes','RTO_JK_v1'),
  -- T3 — PRE_CHECK for Bashir (bind done, pre-check pending).
  ('0c000003-0000-4000-8000-000000000003','0a5c0001-0000-4000-8000-000000000001','0a0c0001-0000-4000-8000-0000000000a1','0e100001-0000-4000-8000-000000000001','0d110001-0000-4000-8000-000000000001','0a770001-0000-4000-8000-000000000001','PICKUP',
   'PRE_CHECK', true, false, false, current_date + time '13:15', current_date + time '13:50', null,'RTO_JK_v1'),
  -- T2 — SCHEDULED for Bashir (afternoon drop, nothing done yet).
  ('0c000002-0000-4000-8000-000000000002','0a5c0001-0000-4000-8000-000000000001','0a0c0002-0000-4000-8000-0000000000a2','0e100002-0000-4000-8000-000000000002','0d110001-0000-4000-8000-000000000001','0a770002-0000-4000-8000-000000000002','DROP',
   'SCHEDULED', false, false, false, current_date + time '14:30', current_date + time '15:00', null,'RTO_JK_v1'),
  -- T5 — COMPLETED (school A, BUS-02) — hosts historical alerts (not on active board).
  ('0c000005-0000-4000-8000-000000000005','0a5c0001-0000-4000-8000-000000000001','0a0c0002-0000-4000-8000-0000000000a2','0e100002-0000-4000-8000-000000000002','0d110001-0000-4000-8000-000000000001','0a770002-0000-4000-8000-000000000002','DROP',
   'COMPLETED', true, true, true, now() - interval '1 day' - interval '2 hours', now() - interval '1 day' - interval '90 minutes', now() - interval '1 day' - interval '2 hours','RTO_JK_v1'),
  -- T6 — COMPLETED (school A, BUS-01, Manzoor) — hosts a route-deviation alert.
  ('0c000006-0000-4000-8000-000000000006','0a5c0001-0000-4000-8000-000000000001','0a0c0001-0000-4000-8000-0000000000a1','0e100001-0000-4000-8000-000000000001','0d110005-0000-4000-8000-000000000005','0a770001-0000-4000-8000-000000000001','PICKUP',
   'COMPLETED', true, true, true, now() - interval '2 days', now() - interval '2 days' + interval '35 minutes', now() - interval '2 days','RTO_JK_v1'),
  -- T7 — COMPLETED (school B, BUS-03, Farooq) — hosts school-B alerts.
  ('0c000007-0000-4000-8000-000000000007','0a5c0002-0000-4000-8000-000000000002','0a0c0003-0000-4000-8000-0000000000c3','0e100003-0000-4000-8000-000000000003','0d110003-0000-4000-8000-000000000003','0a770003-0000-4000-8000-000000000003','PICKUP',
   'COMPLETED', true, true, true, now() - interval '1 day', now() - interval '1 day' + interval '40 minutes', now() - interval '1 day','RTO_JK_v1');

-- ── EVIDENCE (one per alert; illustrative hashes; only on COMPLETED trips) ────
insert into evidence_records (id, trip_id, seq, kind, payload, prev_hash, record_hash, created_at) values
  ('0ed00001-0000-4000-8000-000000000001','0c000005-0000-4000-8000-000000000005',1,'ALERT','{"type":"OVERSPEED"}'::jsonb,      'GENESIS','a1b2c3d4e5f60718293a4b5c6d7e8f9012a1b2c3d4e5f60718293a4b5c6d7e8f', now() - interval '1 day'),
  ('0ed00002-0000-4000-8000-000000000002','0c000005-0000-4000-8000-000000000005',2,'ALERT','{"type":"LONG_STOP"}'::jsonb,      'a1b2c3d4e5f60718293a4b5c6d7e8f9012a1b2c3d4e5f60718293a4b5c6d7e8f','b2c3d4e5f60718293a4b5c6d7e8f9012a1b2c3d4e5f60718293a4b5c6d7e8fa1', now() - interval '1 day'),
  ('0ed00003-0000-4000-8000-000000000003','0c000006-0000-4000-8000-000000000006',1,'ALERT','{"type":"ROUTE_DEVIATION"}'::jsonb,'GENESIS','c3d4e5f60718293a4b5c6d7e8f9012a1b2c3d4e5f60718293a4b5c6d7e8fa1b2', now() - interval '2 days'),
  ('0ed00004-0000-4000-8000-000000000004','0c000007-0000-4000-8000-000000000007',1,'ALERT','{"type":"OVERSPEED"}'::jsonb,      'GENESIS','d4e5f60718293a4b5c6d7e8f9012a1b2c3d4e5f60718293a4b5c6d7e8fa1b2c3', now() - interval '1 day'),
  ('0ed00005-0000-4000-8000-000000000005','0c000007-0000-4000-8000-000000000007',2,'ALERT','{"type":"DELAY"}'::jsonb,          'd4e5f60718293a4b5c6d7e8f9012a1b2c3d4e5f60718293a4b5c6d7e8fa1b2c3','e5f60718293a4b5c6d7e8f9012a1b2c3d4e5f60718293a4b5c6d7e8fa1b2c3d4', now() - interval '1 day');

-- ── ALERTS ──────────────────────────────────────────────────────────────────
insert into alerts (id, evidence_id, trip_id, school_id, vehicle_id, driver_id, type, subtype,
                    severity, confidence, status, started_at, ended_at, summary, metrics, identity_key) values
  -- A1 — school A open CRITICAL (shows on school board criticals panel + RTO HIGH).
  ('0a1e0001-0000-4000-8000-000000000001','0ed00001-0000-4000-8000-000000000001','0c000005-0000-4000-8000-000000000005','0a5c0001-0000-4000-8000-000000000001','0e100002-0000-4000-8000-000000000002','0d110001-0000-4000-8000-000000000001','OVERSPEED',null,'CRITICAL','HIGH','OPEN', now() - interval '1 day', now() - interval '1 day' + interval '1 minute','Sustained 58 km/h in a 40 km/h zone for 22s near Dalgate.','{"peak_kmh":58,"limit_kmh":40,"sustained_s":22}'::jsonb,'OVERSPEED:day1'),
  -- A2 — school A HIGH route deviation (WARN).
  ('0a1e0002-0000-4000-8000-000000000002','0ed00003-0000-4000-8000-000000000003','0c000006-0000-4000-8000-000000000006','0a5c0001-0000-4000-8000-000000000001','0e100001-0000-4000-8000-000000000001','0d110005-0000-4000-8000-000000000005','ROUTE_DEVIATION',null,'WARN','HIGH','OPEN', now() - interval '2 days', now() - interval '2 days' + interval '2 minutes','Off the Route A corridor by 180 m for ~60s past Naseem Bagh.','{"max_offset_m":180,"sustained_s":60}'::jsonb,'ROUTE_DEVIATION:day2'),
  -- A3 — school A MEDIUM long stop.
  ('0a1e0003-0000-4000-8000-000000000003','0ed00002-0000-4000-8000-000000000002','0c000005-0000-4000-8000-000000000005','0a5c0001-0000-4000-8000-000000000001','0e100002-0000-4000-8000-000000000002','0d110001-0000-4000-8000-000000000001','LONG_STOP',null,'WARN','MEDIUM','OPEN', now() - interval '1 day' - interval '10 minutes', now() - interval '1 day','Stationary 9 min beyond the allowed dwell at Budshah Chowk.','{"dwell_s":540,"allowed_s":180}'::jsonb,'LONG_STOP:day1'),
  -- A4 — school B open CRITICAL / RTO HIGH.
  ('0a1e0004-0000-4000-8000-000000000004','0ed00004-0000-4000-8000-000000000004','0c000007-0000-4000-8000-000000000007','0a5c0002-0000-4000-8000-000000000002','0e100003-0000-4000-8000-000000000003','0d110003-0000-4000-8000-000000000003','OVERSPEED',null,'CRITICAL','HIGH','OPEN', now() - interval '1 day', now() - interval '1 day' + interval '1 minute','Sustained 61 km/h in a 40 km/h zone for 31s on Harwan Road.','{"peak_kmh":61,"limit_kmh":40,"sustained_s":31}'::jsonb,'OVERSPEED:day1b'),
  -- A5 — school B MEDIUM delay.
  ('0a1e0005-0000-4000-8000-000000000005','0ed00005-0000-4000-8000-000000000005','0c000007-0000-4000-8000-000000000007','0a5c0002-0000-4000-8000-000000000002','0e100003-0000-4000-8000-000000000003','0d110003-0000-4000-8000-000000000003','DELAY',null,'INFO','MEDIUM','OPEN', now() - interval '1 day', now() - interval '1 day' + interval '3 minutes','Arrived 14 min behind the route median.','{"delay_min":14,"median_min":30}'::jsonb,'DELAY:day1b');

-- ── COMPLAINTS ───────────────────────────────────────────────────────────────
insert into complaints (id, school_id, vehicle_id, trip_id, anonymous, category, ai_suggested_category,
                       ai_confidence, severity, body, upheld, status, created_at) values
  ('0c1a0001-0000-4000-8000-000000000001','0a5c0001-0000-4000-8000-000000000001','0e100002-0000-4000-8000-000000000002','0c000005-0000-4000-8000-000000000005', false,'Rash driving','Rash driving',0.88,'HIGH','Bus repeatedly overspeeding near Dalgate during the morning run.', true,'RESOLVED', now() - interval '2 days'),
  ('0c1a0002-0000-4000-8000-000000000002','0a5c0001-0000-4000-8000-000000000001','0e100001-0000-4000-8000-000000000001',null, false,'Late arrival','Late arrival',0.72,'MEDIUM','Bus arrived about 20 minutes late twice this week.', null,'OPEN', now() - interval '1 day'),
  ('0c1a0003-0000-4000-8000-000000000003','0a5c0002-0000-4000-8000-000000000002','0e100003-0000-4000-8000-000000000003',null, true, null,'Overcrowding',0.64,'MEDIUM','More children than seats on the morning pickup.', null,'OPEN', now() - interval '6 hours');

-- ── TELEMETRY — live tail for the ACTIVE Route-A trip (parent view). ──────────
-- server_ts within the last ~3 minutes so the RLS live-tail window (parent) is
-- satisfied right after seeding. Coordinates follow Route A (lng,lat → lat,lng).
insert into telemetry (trip_id, seq, device_ts, server_ts, lat, lng, speed_mps, heading, accuracy_m, app_state, buffered, quality, source) values
  ('0c000001-0000-4000-8000-000000000001',1, now() - interval '150 seconds', now() - interval '150 seconds', 34.0700, 74.7900, 8.2, 48, 7, 'FOREGROUND', false, 'GOOD', 'REPLAY'),
  ('0c000001-0000-4000-8000-000000000001',2, now() - interval '115 seconds', now() - interval '115 seconds', 34.0740, 74.7975, 9.1, 47, 6, 'FOREGROUND', false, 'GOOD', 'REPLAY'),
  ('0c000001-0000-4000-8000-000000000001',3, now() - interval '80 seconds',  now() - interval '80 seconds',  34.0785, 74.8050, 9.8, 46, 8, 'FOREGROUND', false, 'GOOD', 'REPLAY'),
  ('0c000001-0000-4000-8000-000000000001',4, now() - interval '45 seconds',  now() - interval '45 seconds',  34.0830, 74.8130, 10.3, 45, 6, 'FOREGROUND', false, 'GOOD', 'REPLAY'),
  ('0c000001-0000-4000-8000-000000000001',5, now() - interval '10 seconds',  now() - interval '10 seconds',  34.0875, 74.8200, 9.4, 45, 7, 'FOREGROUND', false, 'GOOD', 'REPLAY');
