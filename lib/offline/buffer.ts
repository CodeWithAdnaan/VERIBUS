// ============================================================================
// OFFLINE FIX BUFFER (BUILD SPEC §9) — the driver PWA's write-ahead log.
//
// Mobile browsers throttle or suspend GPS when the screen is off or the app is
// backgrounded (see <PilotGap id="background-gps">). This buffer is the honesty
// mechanism: every GPS fix is written to IndexedDB FIRST, then we try to POST it.
// A fix is only ever removed AFTER the server has acknowledged it. We NEVER drop
// a fix — a lost network means the data backfills later, it does not vanish.
//
// This module is client-only. Every function guards `typeof window` so importing
// it in a Server Component (or during SSR) is a no-op rather than a crash.
// ============================================================================
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/** One GPS fix, shaped exactly for POST /api/telemetry/batch `fixes[]`. */
export interface Fix {
  seq: number;
  device_ts: string; // ISO 8601, from the device clock
  lat: number;
  lng: number;
  speed_mps: number | null; // GPS Doppler only — NEVER derived. null is legal.
  heading: number | null;
  accuracy_m: number;
  app_state: 'FOREGROUND' | 'BACKGROUND';
  buffered: boolean; // true once this fix has survived a failed send and is backfilling
}

/** A fix as stored, carrying its local auto-increment key. */
export interface StoredFix extends Fix {
  id: number;
}

const DB_NAME = 'stip-driver-buffer';
const DB_VERSION = 1;
const FIX_STORE = 'fixes';
const META_STORE = 'meta';
const SEQ_KEY = 'seq';

interface BufferSchema extends DBSchema {
  fixes: { key: number; value: Fix };
  meta: { key: string; value: number };
}

function canUseIDB(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

let dbPromise: Promise<IDBPDatabase<BufferSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<BufferSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<BufferSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(FIX_STORE)) {
          db.createObjectStore(FIX_STORE, { autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE);
        }
      },
    });
  }
  return dbPromise;
}

/**
 * A persistent, strictly-monotonic sequence counter. The value survives reloads
 * (it lives in IndexedDB), so `seq` keeps climbing across app restarts and never
 * collides within a trip. telemetry ingest is idempotent on (trip_id, seq).
 * Returns the value to use for the next fix, then advances the stored counter.
 */
export async function nextSeq(): Promise<number> {
  if (!canUseIDB()) return 0;
  const db = await getDb();
  const tx = db.transaction(META_STORE, 'readwrite');
  const current = (await tx.store.get(SEQ_KEY)) ?? 0;
  await tx.store.put(current + 1, SEQ_KEY);
  await tx.done;
  return current;
}

/** Persist a fix. Resolves once it is durably written. Returns its local id. */
export async function enqueue(fix: Fix): Promise<number> {
  if (!canUseIDB()) return -1;
  const db = await getDb();
  return db.add(FIX_STORE, fix);
}

/** All buffered fixes, oldest first (by seq). Non-destructive — the caller only
 *  removes them after the server has acknowledged them. */
export async function peekAll(): Promise<StoredFix[]> {
  if (!canUseIDB()) return [];
  const db = await getDb();
  const tx = db.transaction(FIX_STORE, 'readonly');
  const store = tx.objectStore(FIX_STORE);
  const [values, keys] = await Promise.all([store.getAll(), store.getAllKeys()]);
  await tx.done;
  return values
    .map((v, i) => ({ ...v, id: keys[i] as number }))
    .sort((a, b) => a.seq - b.seq);
}

/** Delete specific buffered fixes by their local ids (call after a successful POST). */
export async function clear(ids: number[]): Promise<void> {
  if (!canUseIDB() || ids.length === 0) return;
  const db = await getDb();
  const tx = db.transaction(FIX_STORE, 'readwrite');
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

/** Delete every buffered fix whose seq is <= the acknowledged high-water mark. */
export async function removeUpTo(seq: number): Promise<void> {
  if (!canUseIDB()) return;
  const all = await peekAll();
  const toDelete = all.filter((f) => f.seq <= seq).map((f) => f.id);
  await clear(toDelete);
}

/** Count of fixes still waiting to be sent — surfaced in the UI as "buffered". */
export async function count(): Promise<number> {
  if (!canUseIDB()) return 0;
  const db = await getDb();
  return db.count(FIX_STORE);
}
