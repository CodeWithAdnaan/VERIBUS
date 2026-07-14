// ============================================================================
// PILOT GAPS (BUILD SPEC §2) — every place a real pilot would need something we
// do not have. Aggregated on /limitations. This is a FEATURE, not an apology:
// a system that knows its own limits is the one a department can trust.
// ============================================================================
export interface PilotGapDef {
  id: string;
  title: string;
  body: string;
  where: string; // where in the product this shows up
}

export const PILOT_GAPS: PilotGapDef[] = [
  {
    id: 'background-gps',
    title: 'Native background location',
    body: 'Mobile browsers throttle or suspend GPS when the app is backgrounded or the screen is off. The PWA holds a Wake Lock and buffers fixes to IndexedDB, but a native wrapper (or a foreground-service Android build) is needed for guaranteed background tracking. Heartbeats + the coverage-gap vs tamper distinction make the gap visible rather than hidden.',
    where: 'Driver Trip Mode',
  },
  {
    id: 'departmental-feeds',
    title: 'Departmental data feeds (Vahan / Sarathi / AIS-140)',
    body: 'Vehicle, permit, fitness, insurance and PUC data are entered manually and marked "pending departmental verification". A DocumentSourceAdapter interface exists so a verified feed can be slotted in — but no integration is built or implied.',
    where: 'Fleet documents, Inspection memo',
  },
  {
    id: 'verified-speed-segments',
    title: 'Verified per-road / school-zone speed limits',
    body: 'Overspeed is evaluated against a single operator-set limit and its cited source. Per-road and school-zone limit segments require a verified departmental dataset we do not have. The school_zones table is the seam; it ships empty. Until then the default limit applies and the system never asserts a zone limit on its own authority.',
    where: 'Policy screen, Overspeed alerts',
  },
  {
    id: 'qr-photographable',
    title: 'The in-bus QR sticker can be photographed',
    body: 'The HMAC bind proves the driver saw the sticker; it is not unspoofable. Mitigations: rotate bind_secret, and log + geofence the bind location (a bind far from any route stop is flagged). We do not claim the sticker cannot be copied.',
    where: 'Driver bind',
  },
  {
    id: 'cron-on-deploy',
    title: 'Scheduled sweeps run only on deploy',
    body: 'TRIP_NOT_STARTED and signal re-evaluation run on a Vercel cron in production. In local/dev there is no cron, so the sweep is triggered by the "Run schedule sweep" button in /admin. The logic is identical; only the trigger differs.',
    where: 'Admin, TRIP_NOT_STARTED',
  },
  {
    id: 'no-voice',
    title: 'No Kashmiri / Urdu voice output',
    body: 'The UI ships in English + Hindi (Devanagari). We deliberately do NOT ship Kashmiri or Urdu TTS: usable voices do not exist and a broken voice feature would undermine trust. This is stated plainly rather than faked.',
    where: 'Internationalisation',
  },
  {
    id: 'auto-face-blur',
    title: 'Automatic face blur is not the guaranteed path',
    body: 'Complaint photos use a manual blur brush that BLOCKS upload until the user confirms faces are blurred. Automatic face detection is an optional enhancement; we never ship an auto-blur we cannot guarantee.',
    where: 'Parent complaint',
  },
  {
    id: 'realtime-scale',
    title: 'Realtime + retention are pilot-scale',
    body: 'Live updates use Supabase Realtime and the ingest re-evaluates the whole trip each batch — fine for a pilot fleet, not tuned for thousands of concurrent buses. Retention is a manual/scheduled purge, not yet a hardened data-lifecycle job.',
    where: 'Ingest, Retention',
  },
];

export const pilotGap = (id: string): PilotGapDef | undefined =>
  PILOT_GAPS.find((g) => g.id === id);
