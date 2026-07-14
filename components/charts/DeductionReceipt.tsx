import type { DeductionLedger } from '@/lib/engine/types';
import { fmtDate } from '@/lib/format';

// The compliance score rendered as a RECEIPT, not a donut (BUILD SPEC §11).
// Monospace, right-aligned figures, running total, boxed final. Every line links
// to its evidence record. "An inspection order cannot be issued on a score nobody
// can explain. That is why this is a rulebook, not a model."
export function DeductionReceipt({
  ledger,
  evidenceHref,
}: {
  ledger: DeductionLedger;
  evidenceHref?: (evidenceId: string | null | undefined) => string | undefined;
}) {
  const allLines = [...ledger.lines, ...ledger.doc_lines];
  let running = ledger.base;

  return (
    <div className="tnum rounded-ops border border-ink-700 bg-ink-950/60 p-4 text-13">
      <div className="mb-2 flex items-center justify-between border-b border-ink-700 pb-2">
        <span className="uppercase tracking-[0.08em] text-ink-400">Compliance ledger</span>
        <span className="text-11 text-ink-500">policy {ledger.policy_version}</span>
      </div>

      <div className="flex items-center justify-between py-1">
        <span className="text-ink-300">Base</span>
        <span className="text-ink-100">{ledger.base.toFixed(2)}</span>
      </div>

      {allLines.length === 0 && (
        <div className="py-2 text-center text-12 text-ink-500">
          No deductions on record. Clean compliance.
        </div>
      )}

      {allLines.map((l, i) => {
        running -= l.applied;
        const href = evidenceHref?.(l.evidence_id);
        const label = (
          <span className="text-ink-200">
            − {l.event_class}
            <span className="ml-1 text-11 text-ink-500">
              ({l.raw_weight}×{l.conf_mult}
              {l.decay_mult !== 1 ? `×${l.decay_mult.toFixed(2)}` : ''}, {fmtDate(l.occurred_at)})
            </span>
          </span>
        );
        return (
          <div key={i} className="flex items-center justify-between border-t border-ink-800 py-1">
            {href ? (
              <a href={href} className="underline decoration-ink-600 underline-offset-2 hover:decoration-sig-info">
                {label}
              </a>
            ) : (
              label
            )}
            <span className="flex items-baseline gap-3">
              <span className={l.applied > 0 ? 'text-sig-alert' : 'text-ink-500'}>
                {l.applied > 0 ? `−${l.applied.toFixed(2)}` : '0.00'}
              </span>
              <span className="w-14 text-right text-ink-400">{running.toFixed(2)}</span>
            </span>
          </div>
        );
      })}

      <div className="mt-3 flex items-center justify-between border-2 border-ink-500 bg-ink-900 px-3 py-2">
        <span className="font-semibold uppercase tracking-[0.08em] text-ink-200">Final score</span>
        <span className="text-20 font-semibold text-ink-100">{ledger.final.toFixed(0)}</span>
      </div>
    </div>
  );
}
