// Small formatting helpers. All numbers/timestamps render in tabular mono.
export const shortHash = (h?: string | null, head = 6, tail = 6): string => {
  if (!h) return '—';
  if (h.length <= head + tail + 1) return h;
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
};

export const fmtTime = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

export const fmtDateTime = (iso?: string | null): string =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

export const fmtDate = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const kmhFromMps = (m: number | null | undefined): number | null =>
  m == null ? null : Math.round(m * 3.6);

export const isExpired = (dateStr?: string | null): boolean =>
  !!dateStr && new Date(dateStr).getTime() < Date.now();

export const daysUntil = (dateStr?: string | null): number | null =>
  dateStr ? Math.round((new Date(dateStr).getTime() - Date.now()) / 86_400_000) : null;
