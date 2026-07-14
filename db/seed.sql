-- ============================================================================
-- SEED — deterministic backbone (BUILD SPEC §17)
-- Stable UUIDs so demo:reset reproduces the same fleet and the replay tracks in
-- /seed/tracks/*.json can reference route_id + vehicle_id.
--
-- Route geometry here is SYNTHETIC (near Srinagar ≈34.08N,74.80E). scripts/seed.mjs
-- overwrites route.polyline from /seed/routes/*.geojson (also synthetic placeholders).
-- Bulk students/guardians/consents + Supabase auth users are added by seed.mjs.
--
-- NOTE ON COORDINATES: these are clearly-labelled synthetic paths, never presented
-- as real. Replace /seed/routes/*.geojson with drawn routes before any demo.
-- ============================================================================

-- ── schools ──────────────────────────────────────────────────────────────────
insert into schools (id, name, district, contact_phone, require_attendant) values
  ('0a5c0001-0000-4000-8000-000000000001', 'Valley Public School',        'Srinagar', '+91-194-000-0001', true),
  ('0a5c0002-0000-4000-8000-000000000002', 'Dal Lake Convent School',     'Srinagar', '+91-194-000-0002', true);

-- ── vehicles (docs are MANUAL_ENTRY — never VAHAN) ───────────────────────────
insert into vehicles (id, school_id, registration_no, bus_code, capacity, bind_secret,
                      fitness_expiry, permit_expiry, insurance_expiry, puc_expiry,
                      speed_governor_fitted, doc_source, active) values
  ('0e100001-0000-4000-8000-000000000001','0a5c0001-0000-4000-8000-000000000001','JK01-AA-0001','BUS-01',40,'demo-secret-bus-01','2026-11-30','2027-03-31','2026-09-30','2026-08-31', true,'MANUAL_ENTRY', true),
  ('0e100002-0000-4000-8000-000000000002','0a5c0001-0000-4000-8000-000000000001','JK01-AA-0002','BUS-02',40,'demo-secret-bus-02','2026-06-30','2026-12-31','2026-10-31','2026-07-31', true,'MANUAL_ENTRY', true),
  ('0e100005-0000-4000-8000-000000000005','0a5c0001-0000-4000-8000-000000000001','JK01-AA-0005','BUS-05',42,'demo-secret-bus-05','2027-01-31','2027-05-31','2026-12-31','2026-11-30', false,'MANUAL_ENTRY', true),
  ('0e100003-0000-4000-8000-000000000003','0a5c0002-0000-4000-8000-000000000002','JK01-BB-0003','BUS-03',36,'demo-secret-bus-03','2026-05-31','2026-11-30','2026-08-31','2026-06-30', true,'MANUAL_ENTRY', true),
  ('0e100004-0000-4000-8000-000000000004','0a5c0002-0000-4000-8000-000000000002','JK01-BB-0004','BUS-04',36,'demo-secret-bus-04','2026-04-30','2026-10-31','2026-07-31','2026-05-31', false,'MANUAL_ENTRY', true),
  ('0e100006-0000-4000-8000-000000000006','0a5c0002-0000-4000-8000-000000000002','JK01-BB-0006','BUS-06',44,'demo-secret-bus-06','2027-02-28','2027-06-30','2027-01-31','2026-12-31', true,'MANUAL_ENTRY', true);

-- ── drivers ──────────────────────────────────────────────────────────────────
insert into drivers (id, school_id, full_name, phone, licence_no, licence_expiry, active) values
  ('0d110001-0000-4000-8000-000000000001','0a5c0001-0000-4000-8000-000000000001','Bashir Ahmad','+91-90000-00001','DL-JK-0001','2028-01-31', true),
  ('0d110002-0000-4000-8000-000000000002','0a5c0001-0000-4000-8000-000000000001','Gulzar Khan', '+91-90000-00002','DL-JK-0002','2027-06-30', true),
  ('0d110005-0000-4000-8000-000000000005','0a5c0001-0000-4000-8000-000000000001','Manzoor Lone','+91-90000-00005','DL-JK-0005','2026-09-30', true),
  ('0d110003-0000-4000-8000-000000000003','0a5c0002-0000-4000-8000-000000000002','Farooq Dar',  '+91-90000-00003','DL-JK-0003','2027-12-31', true),
  ('0d110004-0000-4000-8000-000000000004','0a5c0002-0000-4000-8000-000000000002','Imtiyaz Bhat','+91-90000-00004','DL-JK-0004','2028-03-31', true),
  ('0d110006-0000-4000-8000-000000000006','0a5c0002-0000-4000-8000-000000000002','Nazir Wani',  '+91-90000-00006','DL-JK-0006','2026-04-30', true);

-- ── attendants (pin_hash is a placeholder; set properly via app in production) ─
insert into attendants (id, school_id, full_name, phone, pin_hash, active) values
  ('0a770001-0000-4000-8000-000000000001','0a5c0001-0000-4000-8000-000000000001','Shazia Begum','+91-90000-10001','PLACEHOLDER', true),
  ('0a770002-0000-4000-8000-000000000002','0a5c0001-0000-4000-8000-000000000001','Rukhsana Jan','+91-90000-10002','PLACEHOLDER', true),
  ('0a770003-0000-4000-8000-000000000003','0a5c0002-0000-4000-8000-000000000002','Yasmeen Akhtar','+91-90000-10003','PLACEHOLDER', true),
  ('0a770004-0000-4000-8000-000000000004','0a5c0002-0000-4000-8000-000000000002','Parveena Mir','+91-90000-10004','PLACEHOLDER', true);

-- ── routes (SYNTHETIC polylines; overwritten from geojson by seed.mjs) ────────
insert into routes (id, school_id, name, direction, polyline, corridor_m) values
  ('0a0c0001-0000-4000-8000-0000000000a1','0a5c0001-0000-4000-8000-000000000001','Route A — Rainawari → School','PICKUP',
    '{"type":"LineString","coordinates":[[74.7900,34.0700],[74.7975,34.0740],[74.8050,34.0785],[74.8130,34.0830],[74.8200,34.0875],[74.8270,34.0920],[74.8340,34.0960]]}', 60),
  ('0a0c0002-0000-4000-8000-0000000000a2','0a5c0001-0000-4000-8000-000000000001','Route B — Lal Chowk → School','DROP',
    '{"type":"LineString","coordinates":[[74.8060,34.0740],[74.8110,34.0790],[74.8170,34.0835],[74.8230,34.0880],[74.8300,34.0930],[74.8360,34.0975]]}', 60),
  ('0a0c0003-0000-4000-8000-0000000000c3','0a5c0002-0000-4000-8000-000000000002','Route C — Nishat → School','PICKUP',
    '{"type":"LineString","coordinates":[[74.8700,34.1100],[74.8760,34.1060],[74.8820,34.1010],[74.8880,34.0965],[74.8940,34.0920],[74.9000,34.0875],[74.9060,34.0830],[74.9120,34.0790]]}', 60);

-- ── stops (placed along the synthetic routes) ────────────────────────────────
-- Route A — 7 stops. Stop seq 3 is the demo student's assigned stop (fixed id).
insert into stops (id, route_id, seq, name, lat, lng, scheduled_offset_min, dwell_allowance_sec) values
  (gen_random_uuid(),'0a0c0001-0000-4000-8000-0000000000a1',1,'Rainawari Chowk',   34.0700,74.7900, 0,180),
  (gen_random_uuid(),'0a0c0001-0000-4000-8000-0000000000a1',2,'Saderbal',          34.0740,74.7975, 5,180),
  ('0570a003-0000-4000-8000-0000000000a1','0a0c0001-0000-4000-8000-0000000000a1',3,'Hazratbal Crossing',34.0785,74.8050,10,180),
  (gen_random_uuid(),'0a0c0001-0000-4000-8000-0000000000a1',4,'Naseem Bagh',       34.0830,74.8130,15,180),
  (gen_random_uuid(),'0a0c0001-0000-4000-8000-0000000000a1',5,'University Gate',   34.0875,74.8200,20,180),
  (gen_random_uuid(),'0a0c0001-0000-4000-8000-0000000000a1',6,'Habak',             34.0920,74.8270,25,180),
  (gen_random_uuid(),'0a0c0001-0000-4000-8000-0000000000a1',7,'School Gate',       34.0960,74.8340,30,240);
-- Route B — 6 stops.
insert into stops (id, route_id, seq, name, lat, lng, scheduled_offset_min, dwell_allowance_sec) values
  (gen_random_uuid(),'0a0c0002-0000-4000-8000-0000000000a2',1,'Lal Chowk',      34.0740,74.8060, 0,180),
  (gen_random_uuid(),'0a0c0002-0000-4000-8000-0000000000a2',2,'Budshah Chowk',  34.0790,74.8110, 5,180),
  (gen_random_uuid(),'0a0c0002-0000-4000-8000-0000000000a2',3,'Dalgate',        34.0835,74.8170,10,180),
  (gen_random_uuid(),'0a0c0002-0000-4000-8000-0000000000a2',4,'Boulevard',      34.0880,74.8230,15,180),
  (gen_random_uuid(),'0a0c0002-0000-4000-8000-0000000000a2',5,'Nehru Park',     34.0930,74.8300,20,180),
  (gen_random_uuid(),'0a0c0002-0000-4000-8000-0000000000a2',6,'School Gate',    34.0975,74.8360,25,240);
-- Route C — 8 stops.
insert into stops (id, route_id, seq, name, lat, lng, scheduled_offset_min, dwell_allowance_sec) values
  (gen_random_uuid(),'0a0c0003-0000-4000-8000-0000000000c3',1,'Nishat Bagh',    34.1100,74.8700, 0,180),
  (gen_random_uuid(),'0a0c0003-0000-4000-8000-0000000000c3',2,'Shalimar',       34.1060,74.8760, 5,180),
  (gen_random_uuid(),'0a0c0003-0000-4000-8000-0000000000c3',3,'Harwan Road',    34.1010,74.8820,10,180),
  (gen_random_uuid(),'0a0c0003-0000-4000-8000-0000000000c3',4,'Brein',          34.0965,74.8880,15,180),
  (gen_random_uuid(),'0a0c0003-0000-4000-8000-0000000000c3',5,'Theed',          34.0920,74.8940,20,180),
  (gen_random_uuid(),'0a0c0003-0000-4000-8000-0000000000c3',6,'Dara Crossing',  34.0875,74.9000,25,180),
  (gen_random_uuid(),'0a0c0003-0000-4000-8000-0000000000c3',7,'Faqir Gujri',    34.0830,74.9060,30,180),
  (gen_random_uuid(),'0a0c0003-0000-4000-8000-0000000000c3',8,'School Gate',    34.0790,74.9120,35,240);

-- ── pre-check items (9, BUILD SPEC §5) ───────────────────────────────────────
insert into precheck_items (id, school_id, code, label, blocking, seq) values
  (gen_random_uuid(), null,'FIRST_AID',        'First-aid kit present & sealed',        true, 1),
  (gen_random_uuid(), null,'FIRE_EXT',         'Fire extinguisher charged & in date',   true, 2),
  (gen_random_uuid(), null,'DOORS',            'Doors open/close & latch correctly',    true, 3),
  (gen_random_uuid(), null,'EMERGENCY_EXIT',   'Emergency exit clear & operable',       true, 4),
  (gen_random_uuid(), null,'ATTENDANT_PRESENT','Attendant on board',                    true, 5),
  (gen_random_uuid(), null,'TYRES',            'Tyres — tread & pressure OK',           true, 6),
  (gen_random_uuid(), null,'BODY_DAMAGE',      'No new body damage affecting safety',   false,7),
  (gen_random_uuid(), null,'LICENCE_ON_PERSON','Driver licence carried',                true, 8),
  (gen_random_uuid(), null,'GOVERNOR_SEAL',    'Speed-governor seal intact (if fitted)',false,9);

-- ── policy config RTO_JK_v1 (BUILD SPEC §6) ──────────────────────────────────
-- default_limit_kmh is set to a DEMO VALUE so the app runs out of the box, and the
-- limit_source string SAYS SO. The RTO Policy screen shows an amber banner until a
-- real circular is cited. The engine still supports the disabled (null) path.
insert into policy_config (id, version, effective_from, is_active, rules) values
  ('0b0c0001-0000-4000-8000-000000000001', 'RTO_JK_v1', current_date, true,
   '{
      "speed": {
        "default_limit_kmh": 40,
        "school_zone_limit_kmh": 25,
        "limit_source": "DEMO VALUE — configured by operator; not asserted by this system",
        "tolerance_kmh": 5,
        "sustained_seconds": 8,
        "min_consecutive_fixes": 4,
        "max_accuracy_m": 25,
        "cooldown_seconds": 120
      },
      "stop": { "movement_threshold_mps": 1.0, "unexpected_stop_sec": 300 },
      "deviation": { "sustained_seconds": 45, "min_fixes": 5, "poor_accuracy_downgrade_m": 25 },
      "delay": { "threshold_min": 10, "min_history_trips": 3 },
      "signal": { "heartbeat_interval_sec": 20, "signal_lost_sec": 120 },
      "integrity": { "require_bind": true, "require_precheck": true, "require_attendant": true },
      "scoring": {
        "base": 100,
        "deductions": {
          "TRIP_NOT_STARTED": 8, "SIGNAL_TAMPER": 6, "ROUTE_DEVIATION": 5, "OVERSPEED": 4,
          "COMPLAINT_UPHELD": 4, "LONG_STOP": 3, "PRECHECK_FAILED_BLOCKING": 5,
          "DOC_EXPIRED": 10, "COVERAGE_GAP": 0
        },
        "confidence_multiplier": { "HIGH": 1.0, "MEDIUM": 0.5, "LOW": 0.0 },
        "decay": { "half_weight_after_days": 45, "drop_after_days": 90 }
      },
      "retention": { "raw_telemetry_days": 30, "evidence_days": 365 }
    }'::jsonb);

-- ── demo privacy chain (parent → student → consent) for rls.test.sql ─────────
-- Guardian.user_id + parent profile are linked to a real auth user by seed.mjs.
insert into guardians (id, full_name, phone) values
  ('09110001-0000-4000-8000-0000000000d1','Aisha Parent','+91-98000-00001');
insert into students (id, school_id, display_name, class_label, assigned_route_id, assigned_stop_id) values
  ('05100001-0000-4000-8000-0000000000d1','0a5c0001-0000-4000-8000-000000000001','Zoya','Class 4',
    '0a0c0001-0000-4000-8000-0000000000a1','0570a003-0000-4000-8000-0000000000a1');
insert into guardian_student (guardian_id, student_id) values
  ('09110001-0000-4000-8000-0000000000d1','05100001-0000-4000-8000-0000000000d1');
insert into consents (id, guardian_id, student_id, notice_version, channel, granted_at) values
  (gen_random_uuid(),'09110001-0000-4000-8000-0000000000d1','05100001-0000-4000-8000-0000000000d1','NOTICE_v1','APP', now());

-- ── trip schedules (drive TRIP_NOT_STARTED sweep) ────────────────────────────
-- One AM pickup per route. days_of_week 1..7 so it is always "due today" for the demo.
insert into trip_schedules (id, route_id, vehicle_id, driver_id, attendant_id, direction,
                            planned_start_local, planned_duration_min, days_of_week, grace_minutes, active) values
  (gen_random_uuid(),'0a0c0001-0000-4000-8000-0000000000a1','0e100005-0000-4000-8000-000000000005','0d110001-0000-4000-8000-000000000001','0a770001-0000-4000-8000-000000000001','PICKUP','07:30',35,'{1,2,3,4,5,6,7}',10, true),
  (gen_random_uuid(),'0a0c0002-0000-4000-8000-0000000000a2','0e100002-0000-4000-8000-000000000002','0d110002-0000-4000-8000-000000000002','0a770002-0000-4000-8000-000000000002','DROP',  '14:30',30,'{1,2,3,4,5,6,7}',10, true),
  (gen_random_uuid(),'0a0c0003-0000-4000-8000-0000000000c3','0e100003-0000-4000-8000-000000000003','0d110003-0000-4000-8000-000000000003','0a770003-0000-4000-8000-000000000003','PICKUP','07:15',40,'{1,2,3,4,5,6,7}',10, true);
