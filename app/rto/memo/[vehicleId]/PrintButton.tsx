'use client';

// Small client child for the printable memo: triggers the browser print dialog.
// The memo page itself is a server component (DB reads + QR generation), so the
// print control lives here. Marked no-print so it never appears on the sheet.
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-ops border border-ink-600 bg-ink-800 px-3 py-1.5 text-13 font-medium text-ink-100 hover:bg-ink-700"
    >
      Print
    </button>
  );
}
