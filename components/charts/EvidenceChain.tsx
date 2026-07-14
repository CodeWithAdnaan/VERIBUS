import { Hash } from '../ui/Hash';
import { fmtTime } from '@/lib/format';
import { Link2, TriangleAlert, ShieldCheck } from 'lucide-react';

// Vertical stack of evidence blocks joined by a rule (§16). A broken link turns the
// rule into the hazard band and tags the block TAMPERED. Functional motion only:
// blocks settle in verification order, hazard snaps where the chain breaks.
export interface EvidenceBlock {
  seq: number;
  kind: string;
  record_hash: string;
  created_at?: string | null;
}

export function EvidenceChain({
  records,
  brokenAtSeq = null,
}: {
  records: EvidenceBlock[];
  brokenAtSeq?: number | null;
}) {
  const sorted = [...records].sort((a, b) => a.seq - b.seq);
  return (
    <div>
      {/* Chain status header */}
      <div className={`mb-3 flex items-center gap-2 rounded-ops px-3 py-2 text-12 font-medium ${
        brokenAtSeq != null
          ? 'border border-sig-alert/40 bg-sig-alert/[0.06] text-sig-alert'
          : 'border border-sig-ok/30 bg-sig-ok/[0.04] text-sig-ok'
      }`}>
        {brokenAtSeq != null ? (
          <>
            <TriangleAlert size={14} strokeWidth={1.75} aria-hidden />
            Chain broken at record #{brokenAtSeq}
          </>
        ) : (
          <>
            <ShieldCheck size={14} strokeWidth={1.75} aria-hidden />
            Chain intact — {sorted.length} records verified
          </>
        )}
      </div>

      <ol className="space-y-0">
        {sorted.map((r, i) => {
          const broken = brokenAtSeq != null && r.seq >= brokenAtSeq;
          const isBreakPoint = brokenAtSeq != null && r.seq === brokenAtSeq;
          // verification order: each block settles at its slot; a hazard rule
          // snaps in at the slot where the chain breaks
          const slotMs = Math.min(i, 12) * 60;
          return (
            <li
              key={r.seq}
              className="evd-in relative pl-6"
              style={{ animationDelay: `${slotMs}ms` }}
            >
              {/* connector rule */}
              {i > 0 && (
                <span
                  className={`absolute left-[9px] top-[-8px] h-4 w-[2px] ${
                    isBreakPoint ? 'hazard-band hazard-snap' : broken ? 'bg-sig-unmonitored' : 'bg-ink-600'
                  }`}
                  style={isBreakPoint ? { animationDelay: `${slotMs + 100}ms` } : undefined}
                  aria-hidden
                />
              )}
              <span
                className={`absolute left-1 top-2 flex h-4 w-4 items-center justify-center rounded-full border ${
                  isBreakPoint
                    ? 'border-sig-alert text-sig-alert'
                    : broken
                      ? 'border-sig-unmonitored text-sig-unmonitored'
                      : 'border-sig-ok/50 text-sig-ok'
                }`}
                aria-hidden
              >
                {isBreakPoint ? <TriangleAlert size={10} /> : <Link2 size={10} />}
              </span>
              <div
                className={`mb-2 rounded-ops border px-3 py-2 ${
                  isBreakPoint
                    ? 'border-sig-alert bg-sig-alert/[0.06]'
                    : broken
                      ? 'border-sig-unmonitored/40 bg-ink-950/20'
                      : 'border-ink-700 bg-ink-950/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-12">
                    <span className="tnum text-ink-500">#{r.seq}</span>{' '}
                    <span className={`font-medium ${broken ? 'text-ink-400' : 'text-ink-200'}`}>{r.kind}</span>
                  </span>
                  <span className="tnum text-11 text-ink-500">{fmtTime(r.created_at)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <Hash value={r.record_hash} />
                  {isBreakPoint && (
                    <span className="rounded-ops bg-sig-alert px-1.5 py-0.5 text-11 font-bold uppercase text-white">
                      Tampered
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
