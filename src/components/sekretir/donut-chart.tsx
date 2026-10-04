'use client';

/**
 * Lightweight SVG donut chart — no chart lib needed.
 * Segments hover-grow (CSS .sekretir-donut-seg) and expose <title> tooltips.
 */
export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  slices,
  size = 150,
  thickness = 13,
  centerTitle,
  centerValue,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerTitle: string;
  centerValue: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`توزيع ${centerTitle}: ${slices.map((s) => `${s.label} ${Math.round((s.value / (total || 1)) * 100)}%`).join('، ')}`}
        className="-rotate-90"
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#f5f5f4"
          strokeWidth={thickness}
        />
        {total > 0 &&
          slices
            .filter((s) => s.value > 0)
            .map((s) => {
              const frac = s.value / total;
              const dash = frac * c;
              const offset = acc;
              acc += dash;
              return (
                <circle
                  key={s.key}
                  className="sekretir-donut-seg"
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${Math.max(dash - 1.5, 0.5)} ${c - Math.max(dash - 1.5, 0.5)}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                >
                  <title>{`${s.label}: ${Math.round(frac * 100)}%`}</title>
                </circle>
              );
            })}
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-[10px] font-semibold text-stone-400">{centerTitle}</span>
        <span className="text-lg font-extrabold text-stone-800 tabular-nums leading-tight" dir="rtl">
          {centerValue}
        </span>
      </div>
    </div>
  );
}

/** Colors per expense category — shared between donut and legend dots. */
export const CATEGORY_COLORS: Record<string, string> = {
  FOOD: '#f59e0b',
  TRANSPORT: '#14b8a6',
  EDUCATION: '#8b5cf6',
  PROJECTS: '#f97316',
  BILLS: '#eab308',
  SHOPPING: '#ec4899',
  ENTERTAINMENT: '#06b6d4',
  OTHER: '#a8a29e',
};
