import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { isMockDbEnabled } from './dbConfig';

// ──────────────────────────────────────────────────────────────────────────────
// In Next.js dev mode each route module is compiled separately. We store the
// PGlite singleton on globalThis so every route shares the SAME database and
// the same init promise — just like a persistent connection pool.
// ──────────────────────────────────────────────────────────────────────────────
const g = globalThis as any;

function getDbInstance(): PGlite | null { return g._veribusDb ?? null; }
function setDbInstance(db: PGlite) { g._veribusDb = db; }
function getInitPromise(): Promise<void> | null { return g._veribusDbInit ?? null; }
function setInitPromise(p: Promise<void>) { g._veribusDbInit = p; }
function isInitialized(): boolean { return !!g._veribusDbInitialized; }
function markInitialized() { g._veribusDbInitialized = true; }

async function initDbInstance() {
  if (getDbInstance()) return;

  console.log('PGlite: Compiling WebAssembly modules manually...');
  const root = process.cwd();
  const pgliteWasmPath = path.resolve(root, 'node_modules/@electric-sql/pglite/dist/pglite.wasm');
  const initdbWasmPath = path.resolve(root, 'node_modules/@electric-sql/pglite/dist/initdb.wasm');
  const pgliteDataPath = path.resolve(root, 'node_modules/@electric-sql/pglite/dist/pglite.data');

  const pgliteWasmBuf = fs.readFileSync(pgliteWasmPath);
  const initdbWasmBuf = fs.readFileSync(initdbWasmPath);
  const pgliteDataBuf = fs.readFileSync(pgliteDataPath);

  const wasmModule = await WebAssembly.compile(pgliteWasmBuf);
  const initdbWasmModule = await WebAssembly.compile(initdbWasmBuf);
  const fsBundle = new Blob([pgliteDataBuf]);

  console.log('PGlite: Instantiating PGlite database in-memory...');
  setDbInstance(new PGlite({ wasmModule, initdbWasmModule, fsBundle }));
}

export function getMockDb(): PGlite {
  const db = getDbInstance();
  if (!db) {
    throw new Error('PGlite database has not been initialized. Await getMockDbReady() first.');
  }
  return db;
}

export function getMockDbReady(): Promise<void> {
  if (!getInitPromise()) {
    const p = (async () => {
      await initDbInstance();
      await initDb(getMockDb());
    })();
    setInitPromise(p);
  }
  return getInitPromise()!;
}

async function initDb(db: PGlite) {
  if (isInitialized()) return;
  markInitialized();
  try {
    console.log('PGlite: Initializing schema in-memory...');
    const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'db/schema.sql'), 'utf8');
    const policiesSql = fs.readFileSync(path.resolve(process.cwd(), 'db/policies.sql'), 'utf8');
    const seedSql = fs.readFileSync(path.resolve(process.cwd(), 'db/seed.sql'), 'utf8');
    // Demo dataset: today's trips, alerts, evidence, telemetry, complaints. Loaded
    // into the SAME in-memory DB the app queries, so every board has live data.
    const seedDemoSql = fs.readFileSync(path.resolve(process.cwd(), 'db/seed_demo.sql'), 'utf8');

    // Run schema, policies, and backbone seed
    await db.exec(schemaSql);
    await db.exec(policiesSql);
    await db.exec(seedSql);
    await db.exec(seedDemoSql);

    // Run the dynamic roster and users seeding
    await seedDynamicRosterAndUsers(db);
    console.log('PGlite: In-memory database initialized and seeded successfully!');
  } catch (err) {
    console.error('PGlite: Failed to initialize in-memory database:', err);
    g._veribusDbInitialized = false; // allow retry
  }
}

async function seedDynamicRosterAndUsers(db: PGlite) {
  const SCHOOL_A = '0a5c0001-0000-4000-8000-000000000001';
  const SCHOOL_B = '0a5c0002-0000-4000-8000-000000000002';
  const ROUTE_A = '0a0c0001-0000-4000-8000-0000000000a1';
  const ROUTE_B = '0a0c0002-0000-4000-8000-0000000000a2';
  const ROUTE_C = '0a0c0003-0000-4000-8000-0000000000c3';
  const DRIVER_1 = '0d110001-0000-4000-8000-000000000001';
  const GUARDIAN_DEMO = '09110001-0000-4000-8000-0000000000d1';

  // Overwrite polyline geometries from routes file
  for (const [id, file] of [
    [ROUTE_A, 'route_a.geojson'],
    [ROUTE_B, 'route_b.geojson'],
    [ROUTE_C, 'route_c.geojson'],
  ]) {
    const routePath = path.resolve(process.cwd(), 'seed/routes', file);
    if (fs.existsSync(routePath)) {
      const raw = JSON.parse(fs.readFileSync(routePath, 'utf8'));
      const geom = raw.type === 'FeatureCollection' ? raw.features[0].geometry : (raw.type === 'Feature' ? raw.geometry : raw);
      await db.query('update routes set polyline = $1 where id = $2', [JSON.stringify(geom), id]);
    }
  }

  // Seeding bulk roster (40 students / 30 guardians / consents)
  const routesForSchoolA = [ROUTE_A, ROUTE_B];
  for (let i = 1; i <= 29; i++) {
    const onA = i % 3 !== 0;
    const school = onA ? SCHOOL_A : SCHOOL_B;
    const route = onA ? routesForSchoolA[i % 2] : ROUTE_C;
    const g = await db.query(
      'insert into guardians (full_name, phone) values ($1,$2) returning id',
      [`Guardian ${i}`, `+91-98000-${String(1000 + i).padStart(5, '0')}`]
    );
    const s = await db.query(
      `insert into students (school_id, display_name, class_label, assigned_route_id)
       values ($1,$2,$3,$4) returning id`,
      [school, `Student ${i}`, `Class ${(i % 8) + 1}`, route]
    );
    await db.query(
      'insert into guardian_student (guardian_id, student_id) values ($1,$2)',
      [g.rows[0].id, s.rows[0].id]
    );
    const withdrawn = i === 7 || i === 15;
    await db.query(
      `insert into consents (guardian_id, student_id, notice_version, channel, granted_at, withdrawn_at)
       values ($1,$2,'NOTICE_v1','APP', now(), $3)`,
      [g.rows[0].id, s.rows[0].id, withdrawn ? new Date().toISOString() : null]
    );
  }
  for (let i = 30; i <= 39; i++) {
    await db.query(
      `insert into students (school_id, display_name, class_label, assigned_route_id)
       values ($1,$2,$3,$4)`,
      [SCHOOL_A, `Student ${i}`, `Class ${(i % 8) + 1}`, i % 2 ? ROUTE_A : ROUTE_B]
    );
  }

  // Create demo users in auth.users
  const DEMO_USERS = [
    { email: 'rto@demo.gov.in',      role: 'rto_officer',  school_id: null,     full_name: 'RTO Officer (Srinagar)' },
    { email: 'schoolA@demo.gov.in',  role: 'school_admin', school_id: SCHOOL_A, full_name: 'Valley Public — Admin' },
    { email: 'schoolB@demo.gov.in',  role: 'school_admin', school_id: SCHOOL_B, full_name: 'Dal Lake Convent — Admin' },
    { email: 'driver1@demo.gov.in',  role: 'driver',       school_id: SCHOOL_A, full_name: 'Bashir Ahmad', link: { table: 'drivers', id: DRIVER_1 } },
    { email: 'parent@demo.gov.in',   role: 'parent',       school_id: null,     full_name: 'Aisha Parent', link: { table: 'guardians', id: GUARDIAN_DEMO } },
  ];

  for (const u of DEMO_USERS) {
    const uid = crypto.randomUUID();
    await db.query(
      'INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3)',
      [uid, u.email, JSON.stringify({ role: u.role })]
    );
    await db.query(
      `insert into profiles (id, role, school_id, full_name) values ($1,$2,$3,$4)
       on conflict (id) do update set role=excluded.role, school_id=excluded.school_id, full_name=excluded.full_name`,
      [uid, u.role, u.school_id, u.full_name]
    );
    if (u.link) {
      await db.query(`update ${u.link.table} set user_id = $1 where id = $2`, [uid, u.link.id]);
    }
  }
}

// Resolves relationships nested in selects like `vehicles(bus_code)` or `routes(name)`
async function resolveRelations(db: PGlite, table: string, rows: any[], selectStr: string) {
  if (rows.length === 0) return;

  // Check for vehicles(...)
  const vehicleMatch = selectStr.match(/vehicles\(([^)]+)\)/);
  if (vehicleMatch) {
    const cols = vehicleMatch[1].split(',').map(c => c.trim());
    for (const row of rows) {
      if (row.vehicle_id) {
        const selectCols = cols.map(c => `"${c}"`).join(', ');
        const res = await db.query(`SELECT ${selectCols} FROM vehicles WHERE id = $1`, [row.vehicle_id]);
        row.vehicles = res.rows[0] || null;
      } else {
        row.vehicles = null;
      }
    }
  }

  // Check for routes(...)
  const routeMatch = selectStr.match(/routes\(([^)]+)\)/);
  if (routeMatch) {
    const cols = routeMatch[1].split(',').map(c => c.trim());
    for (const row of rows) {
      if (row.route_id) {
        const selectCols = cols.map(c => `"${c}"`).join(', ');
        const res = await db.query(`SELECT ${selectCols} FROM routes WHERE id = $1`, [row.route_id]);
        row.routes = res.rows[0] || null;
      } else {
        row.routes = null;
      }
    }
  }
}

// Clean up nesting in select column lists so PostgreSQL can execute the query
function cleanSelectCols(selectStr: string): string {
  if (selectStr.trim() === '*') return '*';
  let cleaned = selectStr;
  cleaned = cleaned.replace(/vehicles\([^)]+\)/g, 'vehicle_id');
  cleaned = cleaned.replace(/routes\([^)]+\)/g, 'route_id');
  
  const cols = cleaned.split(',').map(c => c.trim()).filter(c => c !== '');
  const uniqueCols = Array.from(new Set(cols));
  return uniqueCols.map(c => `"${c}"`).join(', ');
}

export class MockSupabaseQueryBuilder {
  private table: string;
  private selectCols: string = '*';
  private originalSelectCols: string = '*';
  private whereFilters: Array<
    { col: string; op: string; val: any; sql?: undefined } | { sql: string; col?: undefined; op?: undefined; val?: undefined }
  > = [];
  private orderCol: string | null = null;
  private orderAsc: boolean = true;
  private limitVal: number | null = null;
  private isSingle: boolean = false;
  private isMaybeSingle: boolean = false;

  private opType: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private opData: any = null;
  private opOptions: any = null;

  constructor(table: string) {
    this.table = table;
  }

  select(cols: string = '*') {
    this.originalSelectCols = cols;
    this.selectCols = cleanSelectCols(cols);
    return this;
  }

  eq(col: string, val: any) {
    this.whereFilters.push({ col, op: '=', val });
    return this;
  }

  neq(col: string, val: any) {
    this.whereFilters.push({ col, op: '<>', val });
    return this;
  }

  gte(col: string, val: any) {
    this.whereFilters.push({ col, op: '>=', val });
    return this;
  }

  lte(col: string, val: any) {
    this.whereFilters.push({ col, op: '<=', val });
    return this;
  }

  lt(col: string, val: any) {
    this.whereFilters.push({ col, op: '<', val });
    return this;
  }

  gt(col: string, val: any) {
    this.whereFilters.push({ col, op: '>', val });
    return this;
  }

  in(col: string, vals: any[]) {
    this.whereFilters.push({ col, op: 'IN', val: vals });
    return this;
  }

  or(filterStr: string) {
    const parts = filterStr.split(',');
    const sqlParts = parts.map(part => {
      if (part.includes('.is.null')) {
        const col = part.split('.is.null')[0];
        return `"${col}" IS NULL`;
      } else if (part.includes('.eq.')) {
        const [col, val] = part.split('.eq.');
        return `"${col}" = '${val}'`;
      }
      return 'TRUE';
    });
    this.whereFilters.push({ sql: `(${sqlParts.join(' OR ')})` });
    return this;
  }

  order(col: string, options?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = options?.ascending !== false;
    return this;
  }

  limit(val: number) {
    this.limitVal = val;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  insert(data: any | any[]) {
    this.opType = 'insert';
    this.opData = data;
    return this;
  }

  update(data: any) {
    this.opType = 'update';
    this.opData = data;
    return this;
  }

  upsert(data: any | any[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.opType = 'upsert';
    this.opData = data;
    this.opOptions = options;
    return this;
  }

  delete() {
    this.opType = 'delete';
    return this;
  }

  // Promise-like awaiting
  async then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    try {
      await getMockDbReady();
      const db = getMockDb();

      const params: any[] = [];
      const whereParts: string[] = [];
      const buildWhereClause = () => {
        this.whereFilters.forEach(f => {
          if (f.sql) {
            whereParts.push(f.sql);
          } else if (f.op === 'IN') {
            const placeholders = f.val.map((_: any, idx: number) => `$${params.length + idx + 1}`).join(', ');
            whereParts.push(`"${f.col}" IN (${placeholders})`);
            params.push(...f.val);
          } else {
            whereParts.push(`"${f.col}" ${f.op} $${params.length + 1}`);
            params.push(f.val);
          }
        });
        return whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
      };

      let res: any;

      if (this.opType === 'select') {
        const whereClause = buildWhereClause();
        const orderClause = this.orderCol ? `ORDER BY "${this.orderCol}" ${this.orderAsc ? 'ASC' : 'DESC'}` : '';
        const limitClause = this.limitVal !== null ? `LIMIT ${this.limitVal}` : '';
        const queryText = `SELECT ${this.selectCols} FROM "${this.table}" ${whereClause} ${orderClause} ${limitClause}`;
        res = await db.query(queryText, params);
        await resolveRelations(db, this.table, res.rows, this.originalSelectCols);
      } 
      else if (this.opType === 'insert') {
        const rows = Array.isArray(this.opData) ? this.opData : [this.opData];
        const results = [];
        for (const row of rows) {
          const keys = Object.keys(row);
          const cols = keys.map(k => `"${k}"`).join(', ');
          const rowParams = keys.map(k => row[k]);
          const placeholders = rowParams.map((_, i) => `$${i + 1}`).join(', ');
          const queryText = `INSERT INTO "${this.table}" (${cols}) VALUES (${placeholders}) RETURNING *`;
          const insertRes = await db.query(queryText, rowParams);
          results.push(...insertRes.rows);
        }
        res = { rows: results };
      } 
      else if (this.opType === 'update') {
        const keys = Object.keys(this.opData);
        const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
        params.push(...keys.map(k => this.opData[k]));
        const whereClause = buildWhereClause();
        const queryText = `UPDATE "${this.table}" SET ${sets} ${whereClause} RETURNING *`;
        res = await db.query(queryText, params);
      } 
      else if (this.opType === 'upsert') {
        const rows = Array.isArray(this.opData) ? this.opData : [this.opData];
        const onConflict = this.opOptions?.onConflict || '';
        const ignoreDuplicates = this.opOptions?.ignoreDuplicates || false;
        const results = [];

        for (const row of rows) {
          const keys = Object.keys(row);
          const cols = keys.map(k => `"${k}"`).join(', ');
          const rowParams = keys.map(k => row[k]);
          const placeholders = rowParams.map((_, i) => `$${i + 1}`).join(', ');

          let queryText = `INSERT INTO "${this.table}" (${cols}) VALUES (${placeholders})`;
          if (onConflict) {
            const conflictCols = onConflict.split(',').map(c => `"${c.trim()}"`).join(', ');
            if (ignoreDuplicates) {
              queryText += ` ON CONFLICT (${conflictCols}) DO NOTHING`;
            } else {
              const updateSets = keys
                .filter(k => !onConflict.split(',').map(c => c.trim()).includes(k))
                .map(k => `"${k}" = EXCLUDED."${k}"`)
                .join(', ');
              if (updateSets) {
                queryText += ` ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateSets}`;
              } else {
                queryText += ` ON CONFLICT (${conflictCols}) DO NOTHING`;
              }
            }
          }
          queryText += ' RETURNING *';
          const upsertRes = await db.query(queryText, rowParams);
          results.push(...upsertRes.rows);
        }
        res = { rows: results };
      } 
      else if (this.opType === 'delete') {
        const whereClause = buildWhereClause();
        const queryText = `DELETE FROM "${this.table}" ${whereClause} RETURNING *`;
        res = await db.query(queryText, params);
      }

      let data: any = res.rows;
      if (this.isSingle) {
        if (res.rows.length === 0) {
          throw new Error('Row not found');
        }
        data = res.rows[0];
      } else if (this.isMaybeSingle) {
        data = res.rows[0] || null;
      } else if (this.opType === 'insert' || this.opType === 'upsert') {
        if (!Array.isArray(this.opData)) {
          data = res.rows[0] || null;
        }
      } else if (this.opType === 'update' || this.opType === 'delete') {
        if (res.rows.length === 0) {
          data = null;
        }
      }

      const result = { data, error: null };
      if (onfulfilled) {
        return onfulfilled(result);
      }
      return result;
    } catch (err: any) {
      const result = { data: null, error: { message: err.message } };
      if (onfulfilled) {
        return onfulfilled(result);
      }
      return result;
    }
  }
}

export function getMockServiceClient() {
  return {
    from(table: string) {
      return new MockSupabaseQueryBuilder(table);
    },
    auth: {
      async getUser() {
        return { data: { user: null }, error: null };
      }
    }
  } as any;
}

export function getMockSessionClient(userId: string | null) {
  return {
    from(table: string) {
      return new MockSupabaseQueryBuilder(table);
    },
    auth: {
      async getUser() {
        await getMockDbReady();
        const db = getMockDb();
        if (!userId) return { data: { user: null }, error: null };
        try {
          const res = await db.query('SELECT id, email, raw_user_meta_data FROM auth.users WHERE id = $1', [userId]);
          const user = res.rows[0];
          if (!user) return { data: { user: null }, error: null };
          return {
            data: {
              user: {
                id: user.id,
                email: user.email,
                user_metadata: user.raw_user_meta_data
              }
            },
            error: null
          };
        } catch {
          return { data: { user: null }, error: null };
        }
      }
    }
  } as any;
}
