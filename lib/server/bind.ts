// ============================================================================
// Vehicle QR bind (BUILD SPEC §9). A printed sticker inside the bus encodes
//   VERIBUS1:<vehicleId>:<token>   where token = HMAC(bind_secret[+pepper], vehicleId)
// The driver scans it; the server recomputes and compares. This kills
// "phone left at school" and "wrong vehicle".
//
// HONESTY: the sticker can be photographed. We do NOT claim it is unspoofable.
// Mitigations: rotate bind_secret; log + geofence the bind location. See <PilotGap>.
// ============================================================================
import { createHmac, timingSafeEqual } from 'node:crypto';

function hmac(vehicleId: string, bindSecret: string): string {
  const pepper = process.env.BIND_HMAC_PEPPER ?? '';
  return createHmac('sha256', `${bindSecret}${pepper}`).update(vehicleId).digest('hex');
}

/** The token printed on the sticker (also used to render the QR on the fleet page). */
export function stickerToken(vehicleId: string, bindSecret: string): string {
  return hmac(vehicleId, bindSecret);
}

export function stickerPayload(vehicleId: string, bindSecret: string): string {
  return `VERIBUS1:${vehicleId}:${stickerToken(vehicleId, bindSecret)}`;
}

export interface ParsedScan {
  vehicleId: string;
  token: string;
}
export function parseScan(scan: string): ParsedScan | null {
  const parts = scan.trim().split(':');
  if (parts.length !== 3 || parts[0] !== 'VERIBUS1') return null;
  return { vehicleId: parts[1]!, token: parts[2]! };
}

export function verifyStickerToken(
  vehicleId: string,
  bindSecret: string,
  token: string
): boolean {
  const expected = stickerToken(vehicleId, bindSecret);
  if (expected.length !== token.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}
