// Builds a vehicle's DeductionLedger from its alerts + document expiries + upheld
// complaints (BUILD SPEC §11). One place maps alert type/subtype → score class.
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeScore } from '@/lib/engine/score';
import { getActivePolicy } from './policy';
import { isExpired } from '@/lib/format';
import type { DeductionLedger, DocPenalty, EventClass, ScorableEvent } from '@/lib/engine/types';

export interface AlertRow {
  id: string;
  type: string;
  subtype: string | null;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  severity: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  summary: string;
  evidence_id: string | null;
  metrics: Record<string, unknown>;
  trip_id: string;
}

/** The single mapping from an alert to its score class. Null = not scored. */
export function alertEventClass(type: string, subtype: string | null): EventClass | null {
  switch (type) {
    case 'OVERSPEED': return 'OVERSPEED';
    case 'LONG_STOP': return 'LONG_STOP';
    case 'ROUTE_DEVIATION': return 'ROUTE_DEVIATION';
    case 'DELAY': return 'DELAY';
    case 'TRIP_NOT_STARTED': return 'TRIP_NOT_STARTED';
    case 'REPEAT_COMPLAINT': return null; // a cluster flag; only an UPHELD complaint deducts
    case 'SOS': return null; // escalated, never scored
    case 'SIGNAL_LOST':
      if (subtype === 'COVERAGE_GAP') return 'COVERAGE_GAP'; // weight 0 — never punished for the network
      if (subtype === 'PENDING') return null;
      return 'SIGNAL_TAMPER';
    default:
      return null;
  }
}

export interface VehicleLedger {
  vehicle: Record<string, unknown>;
  ledger: DeductionLedger;
  alerts: AlertRow[];
  policyVersion: string;
}

const DOC_FIELDS: [string, string][] = [
  ['Fitness certificate', 'fitness_expiry'],
  ['Permit', 'permit_expiry'],
  ['Insurance', 'insurance_expiry'],
  ['PUC', 'puc_expiry'],
];

export async function computeVehicleLedger(
  client: SupabaseClient,
  vehicleId: string,
  now: string
): Promise<VehicleLedger> {
  const { data: vehicle } = await client.from('vehicles').select('*').eq('id', vehicleId).single();
  const { data: alertsRaw } = await client
    .from('alerts')
    .select('id, type, subtype, confidence, severity, status, started_at, ended_at, summary, evidence_id, metrics, trip_id')
    .eq('vehicle_id', vehicleId)
    .order('started_at', { ascending: false });
  const alerts = (alertsRaw ?? []) as AlertRow[];

  const active = await getActivePolicy(client);

  const events: ScorableEvent[] = [];
  for (const a of alerts) {
    if (a.status === 'DISMISSED') continue; // a dismissed alert does not deduct
    const ec = alertEventClass(a.type, a.subtype);
    if (!ec) continue;
    events.push({ event_class: ec, confidence: a.confidence, occurred_at: a.started_at, alert_id: a.id, evidence_id: a.evidence_id });
  }

  // Upheld complaints deduct (§5: only an upheld complaint deducts score).
  const { data: upheld } = await client
    .from('complaints')
    .select('id, category, created_at')
    .eq('vehicle_id', vehicleId)
    .eq('upheld', true);
  for (const c of upheld ?? []) {
    events.push({ event_class: 'COMPLAINT_UPHELD', confidence: 'HIGH', occurred_at: c.created_at });
  }

  const docLines: DocPenalty[] = [];
  for (const [label, field] of DOC_FIELDS) {
    const val = (vehicle as Record<string, string | null>)[field];
    if (isExpired(val)) docLines.push({ label: `${label} expired`, event_class: 'DOC_EXPIRED', occurred_at: val! });
  }

  const ledger = computeScore({ events, docLines, policy: active.rules, policyVersion: active.version, now });
  return { vehicle: vehicle as Record<string, unknown>, ledger, alerts, policyVersion: active.version };
}
