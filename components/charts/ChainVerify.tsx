// The public proof, made visible: an abstract N-link chain for /verify/[hash],
// driven entirely by the two numbers the page already has (record_count,
// broken_at_seq) — no records fetched, no PII. Server-rendered, CSS-animated:
// links resolve to --sig-ok in sequence; on tamper, resolution stops at the
// break, the hazard band snaps in, and downstream stays --sig-unmonitored grey
// (never verified is grey, not red). Under reduced motion every animation
// lands on its final frame — the verdict is fully told statically.

type Item = { t: 'seg'; seq: number } | { t: 'gap' };

function buildItems(count: number, broken: number | null): Item[] {
  const want = new Set<number>();
  if (broken === null) {
    if (count <= 9) {
      for (let s = 1; s <= count; s++) want.add(s);
    } else {
      [1, 2, 3, count - 2, count - 1, count].forEach((s) => want.add(s));
    }
  } else {
    [1, 2, broken - 1, broken, broken + 1, count - 1, count].forEach((s) => want.add(s));
  }
  const seqs = [...want].filter((s) => s >= 1 && s <= count).sort((a, b) => a - b);
  const items: Item[] = [];
  seqs.forEach((seq, i) => {
    const prev = seqs[i - 1];
    if (i > 0 && prev !== undefined && seq - prev > 1) items.push({ t: 'gap' });
    items.push({ t: 'seg', seq });
  });
  return items;
}

export function ChainVerify({
  recordCount,
  brokenAtSeq = null,
}: {
  recordCount: number;
  brokenAtSeq?: number | null;
}) {
  if (recordCount <= 0) return null;
  const broken =
    brokenAtSeq !== null && brokenAtSeq >= 1 && brokenAtSeq <= recordCount ? brokenAtSeq : null;
  const items = buildItems(recordCount, broken);

  let slot = 0; // display-order stagger for links that verify
  const verifiedSlots = items.filter(
    (it) => it.t === 'seg' && (broken === null || it.seq < broken),
  ).length;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-y-2" aria-hidden>
      {items.map((it, idx) => {
        const connector =
          idx > 0 ? (
            <span
              key={`k${idx}`}
              className={`h-px w-3 shrink-0 ${
                broken !== null && it.t === 'seg' && it.seq > broken
                  ? 'bg-ink-700 opacity-60'
                  : 'bg-ink-700'
              }`}
            />
          ) : null;

        if (it.t === 'gap') {
          return (
            <span key={`g${idx}`} className="flex items-center">
              {connector}
              <span className="tnum px-1 text-11 text-ink-500">…</span>
            </span>
          );
        }

        const isBroken = broken !== null && it.seq === broken;
        const isDownstream = broken !== null && it.seq > broken;

        let box;
        if (isBroken) {
          box = (
            <span
              className="cv-snap hazard-band flex h-6 min-w-7 items-center justify-center rounded-[3px] px-1"
              style={{ animationDelay: `${verifiedSlots * 90 + 80}ms` }}
            >
              <span className="tnum text-11 font-semibold text-white">{it.seq}</span>
            </span>
          );
        } else if (isDownstream) {
          box = (
            <span className="tnum flex h-6 min-w-7 items-center justify-center rounded-[3px] border border-ink-600 px-1 text-11 text-sig-unmonitored opacity-70">
              {it.seq}
            </span>
          );
        } else {
          const delay = slot * 90;
          slot += 1;
          box = (
            <span
              className="cv-resolve tnum flex h-6 min-w-7 items-center justify-center rounded-[3px] border px-1 text-11"
              style={{ animationDelay: `${delay}ms` }}
            >
              {it.seq}
            </span>
          );
        }

        return (
          <span key={`s${it.seq}`} className="flex items-center">
            {connector}
            {box}
          </span>
        );
      })}
    </div>
  );
}
