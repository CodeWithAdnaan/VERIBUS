// ============================================================================
// DocumentSourceAdapter (BUILD SPEC §2) — the integration seam genuinely exists,
// but we NEVER fake a Vahan / Sarathi / AIS-140 integration. Vehicle documents are
// manual entry. Every document field in the UI carries the chip:
//   "Manually entered — pending departmental verification."
// ============================================================================

export interface VehicleDocs {
  fitness_expiry: string | null;
  permit_expiry: string | null;
  insurance_expiry: string | null;
  puc_expiry: string | null;
}

export interface DocumentSourceAdapter {
  /** e.g. 'MANUAL_ENTRY'. Stored on every vehicle row. Never 'VAHAN'. */
  readonly source: string;
  /** Whether this source is departmentally verified. Manual entry is not. */
  readonly verified: boolean;
  /** Fetch documents for a registration. Manual entry has nothing to fetch. */
  fetchDocs(registrationNo: string): Promise<VehicleDocs | null>;
}

/**
 * The only adapter we ship. It fetches nothing — documents are typed by a human.
 * The seam is real so a future VahanAdapter can slot in; the integration is not.
 */
export class ManualAdapter implements DocumentSourceAdapter {
  readonly source = 'MANUAL_ENTRY';
  readonly verified = false;

  async fetchDocs(_registrationNo: string): Promise<VehicleDocs | null> {
    // No external call. Manual entry is the source of truth in the pilot.
    return null;
  }
}

export const DOCUMENT_CHIP = 'Manually entered — pending departmental verification';
