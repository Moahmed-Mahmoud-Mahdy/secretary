// ============================================================
// Time helpers — Cairo wall-clock time encoded as UTC.
//
// Convention: a stored "2025-01-15T10:00:00.000Z" means
// 10:00 Cairo local wall time (NOT UTC). This keeps planning,
// display and querying consistent without timezone juggling.
// Serialization via toISOString() therefore yields wall time.
// ============================================================

export const CAIRO_TZ = 'Africa/Cairo';

/** Current Cairo wall-clock time encoded as a UTC-based Date. */
export function nowWall(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAIRO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return new Date(
    Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  );
}

/** "YYYY-MM-DD" for a wall-clock Date. */
export function dayKeyOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayKey(): string {
  return dayKeyOf(nowWall());
}

/** Parse "YYYY-MM-DD" into a wall-clock Date at midnight. */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0));
}

/** Combine a day key with "HH:mm" into a wall-clock Date. */
export function wallTime(dayKeyStr: string, hhmm: string): Date {
  const [y, mo, da] = dayKeyStr.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(y, (mo ?? 1) - 1, da ?? 1, h ?? 0, mi ?? 0, 0, 0));
}

/** Accepts "YYYY-MM-DD", "YYYY-MM-DDTHH:mm" or "YYYY-MM-DDTHH:mm:ss" (wall). */
export function parseWallIso(value: string): Date {
  const normalized = value.length === 16 ? `${value}:00` : value;
  const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) throw new Error(`Invalid date: ${value}`);
  return new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0))
  );
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export function endOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

export function diffMinutes(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

export function fmtHHMM(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export const AR_WEEKDAYS = ['الأحد', 'الاثنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'] as const;

export function weekdayArabic(d: Date): string {
  return AR_WEEKDAYS[d.getUTCDay()];
}

const AR_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
] as const;

/** Human Arabic date, e.g. "الخميس 15 يناير". */
export function fmtDateArabic(d: Date): string {
  return `${weekdayArabic(d)} ${d.getUTCDate()} ${AR_MONTHS[d.getUTCMonth()]}`;
}

/**
 * Relative day phrase in Egyptian Arabic compared to now.
 * "النهارده" / "بكرة" / "بعد بكرة" / "امبارح" / weekday + date.
 */
export function relativeDayArabic(target: Date, now: Date): string {
  const diffDays = Math.round((startOfDay(target).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (diffDays === 0) return 'النهارده';
  if (diffDays === 1) return 'بكرة';
  if (diffDays === 2) return 'بعد بكرة';
  if (diffDays === -1) return 'امبارح';
  return fmtDateArabic(target);
}

/** Month key "YYYY-MM" for a wall-clock Date. */
export function monthKeyOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function daysInMonthOf(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}
