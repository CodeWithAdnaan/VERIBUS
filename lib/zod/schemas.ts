// zod schemas for EVERY API boundary (BUILD SPEC §3). Parse failures are 400s.
import { z } from 'zod';

export const fixInput = z.object({
  seq: z.number().int().nonnegative(),
  device_ts: z.string().min(1), // ISO string from the device
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  speed_mps: z.number().nullable(), // GPS Doppler only; null is legal
  heading: z.number().nullable().optional(),
  accuracy_m: z.number().nonnegative(),
  app_state: z.enum(['FOREGROUND', 'BACKGROUND']),
  buffered: z.boolean().optional().default(false),
});
export type FixInput = z.infer<typeof fixInput>;

export const batchInput = z.object({
  trip_id: z.string().uuid(),
  source: z.enum(['DEVICE', 'REPLAY']).optional().default('DEVICE'),
  fixes: z.array(fixInput).min(1).max(500),
});

export const heartbeatInput = z.object({
  trip_id: z.string().uuid(),
  app_state: z.string(),
  gps_permission: z.enum(['granted', 'denied', 'prompt']),
  has_fix: z.boolean(),
  battery_pct: z.number().int().min(0).max(100).nullable().optional(),
});

export const bindInput = z.object({
  trip_id: z.string().uuid(),
  scan: z.string().min(1), // the scanned QR string: STIP1:<vehicleId>:<token>
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

export const precheckInput = z.object({
  trip_id: z.string().uuid(),
  performed_by: z.string().uuid().optional(),
  answers: z
    .array(
      z.object({
        item_code: z.string(),
        ok: z.boolean(),
        note: z.string().optional(),
      })
    )
    .min(1),
});

export const startInput = z.object({ trip_id: z.string().uuid() });
export const endInput = z.object({ trip_id: z.string().uuid() });

export const sosInput = z.object({
  trip_id: z.string().uuid(),
  role: z.enum(['driver', 'attendant']),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

// Replay-only: create + start an ACTIVE demo trip for a route/vehicle track.
export const replayStartInput = z.object({
  route_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
  name: z.string().optional(),
});

// AI seam (BUILD SPEC §13, deferred): the model may output ONLY this object.
export const rtoFilter = z.object({
  vehicle_ids: z.array(z.string().uuid()).optional(),
  alert_types: z
    .array(
      z.enum([
        'OVERSPEED', 'LONG_STOP', 'ROUTE_DEVIATION', 'DELAY',
        'SIGNAL_LOST', 'SOS', 'REPEAT_COMPLAINT', 'TRIP_NOT_STARTED',
      ])
    )
    .optional(),
  min_count: z.number().int().positive().optional(),
  confidence_min: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  zone: z.string().optional(),
});
