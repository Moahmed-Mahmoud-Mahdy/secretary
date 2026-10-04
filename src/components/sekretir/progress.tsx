'use client';

import { cn } from '@/lib/utils';

/**
 * RTL-safe progress bar: fills from the right (start side in RTL).
 * The shadcn Progress uses translateX which breaks under RTL, so
 * Sekretir uses this simple bar everywhere.
 */
export function SekretirProgress({
  value,
  className,
  barClassName,
  ariaLabel,
}: {
  /** 0..100 */
  value: number;
  className?: string;
  barClassName?: string;
  ariaLabel?: string;
}) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={ariaLabel}
      className={cn('h-2.5 w-full bg-stone-100 rounded-full overflow-hidden', className)}
    >
      <div
        className={cn('h-full rounded-full transition-all duration-300 bg-amber-500', barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
