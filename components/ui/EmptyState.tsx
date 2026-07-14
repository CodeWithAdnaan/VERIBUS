import type { ReactNode } from 'react';

// Empty state — a silent board is a good board. The icon is muted (--ink-500),
// the text explains what a clear state MEANS (not that something is broken).
export function EmptyState({
  title,
  icon,
  children,
  className = '',
}: {
  title: string;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center py-8 text-center ${className}`}>
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-ops border border-ink-700 bg-ink-800 text-ink-500">
          {icon}
        </div>
      )}
      <p className="text-14 font-medium text-ink-300">{title}</p>
      {children && (
        <p className="mt-2 max-w-sm text-12 leading-relaxed text-ink-500">{children}</p>
      )}
    </div>
  );
}
