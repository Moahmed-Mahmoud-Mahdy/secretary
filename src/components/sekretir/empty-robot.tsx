'use client';

import { cn } from '@/lib/utils';

/**
 * Cute inline-SVG robot used in empty states — floats gently.
 * Replaces bare emoji so empty screens feel designed, not broken.
 */
export function EmptyRobot({
  title,
  hint,
  className,
  size = 96,
}: {
  title: string;
  hint?: string;
  className?: string;
  size?: number;
}) {
  return (
    <div className={cn('flex flex-col items-center text-center py-8 select-none', className)}>
      <div
        className="sekretir-float relative"
        style={{ width: size, height: size }}
        aria-hidden
      >
        {/* Speech bubble */}
        <div className="absolute -top-1 -start-1 bg-white border border-amber-200 rounded-xl rounded-bl-none px-2 py-1 shadow-sm">
          <span className="text-sm">👋</span>
        </div>
        <svg viewBox="0 0 96 96" width={size} height={size} role="img" aria-label="روبوت سكرتير">
          {/* Antenna */}
          <line x1="48" y1="12" x2="48" y2="22" stroke="#d97706" strokeWidth="3" strokeLinecap="round" />
          <circle cx="48" cy="10" r="4" fill="#f59e0b">
            <animate attributeName="opacity" values="1;0.4;1" dur="1.8s" repeatCount="indefinite" />
          </circle>
          {/* Head */}
          <rect x="22" y="22" width="52" height="42" rx="14" fill="#fffbeb" stroke="#f59e0b" strokeWidth="3" />
          {/* Eyes */}
          <circle cx="38" cy="42" r="5" fill="#451a03">
            <animate attributeName="ry" values="5;5;0.8;5" dur="4s" repeatCount="indefinite" keyTimes="0;0.9;0.94;1" />
          </circle>
          <circle cx="58" cy="42" r="5" fill="#451a03">
            <animate attributeName="ry" values="5;5;0.8;5" dur="4s" repeatCount="indefinite" keyTimes="0;0.9;0.94;1" />
          </circle>
          {/* Eye sparkles */}
          <circle cx="40" cy="40" r="1.5" fill="#fff" />
          <circle cx="60" cy="40" r="1.5" fill="#fff" />
          {/* Smile */}
          <path d="M40 53 Q48 59 56 53" stroke="#d97706" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* Body */}
          <rect x="30" y="68" width="36" height="18" rx="9" fill="#fef3c7" stroke="#f59e0b" strokeWidth="2.5" />
          <circle cx="42" cy="77" r="2" fill="#f59e0b" />
          <circle cx="54" cy="77" r="2" fill="#f59e0b" />
        </svg>
      </div>
      <p className="mt-3 font-bold text-stone-700">{title}</p>
      {hint ? <p className="text-sm text-stone-400 mt-1 max-w-xs">{hint}</p> : null}
    </div>
  );
}
