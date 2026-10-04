// ============================================================
// Sekretir date utils — Cairo wall-clock convention.
// All ISO datetimes from the API encode Cairo wall time as UTC,
// so ALWAYS read them with UTC getters (getUTCHours, getUTCDate...).
// ============================================================

const WEEKDAYS_AR = ['الأحد', 'الاثنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'] as const;
const WEEKDAYS_AR_SHORT = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'] as const;
const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
] as const;

/** "HH:mm" from an ISO datetime (UTC getters = Cairo wall clock). */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Arabic weekday name from an ISO datetime, e.g. "التلات". */
export function fmtDayName(iso: string | null | undefined): string {
  if (!iso) return '';
  return WEEKDAYS_AR[new Date(iso).getUTCDay()];
}

/** "12 مارس" — day + Arabic month name. */
export function fmtDayMonth(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS_AR[d.getUTCMonth()]}`;
}

/** Today's day key in Cairo: "YYYY-MM-DD". */
export function todayKey(): string {
  return Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
}

/** Parse a "YYYY-MM-DD" key into its UTC-ms value. */
export function keyToMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

/** Format a UTC-ms value back to "YYYY-MM-DD". */
export function msToKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Add n days to a "YYYY-MM-DD" key. */
export function addDaysKey(key: string, n: number): string {
  return msToKey(keyToMs(key) + n * 86_400_000);
}

/** Weekday index (0=Sunday) of a "YYYY-MM-DD" key. */
export function keyWeekday(key: string): number {
  return new Date(keyToMs(key)).getUTCDay();
}

/** Short Arabic weekday initial for the week strip. */
export function weekdayInitial(key: string): string {
  return WEEKDAYS_AR_SHORT[keyWeekday(key)];
}

/** Full Arabic weekday name for a day key. */
export function weekdayName(key: string): string {
  return WEEKDAYS_AR[keyWeekday(key)];
}

/** Day number (1..31) of a "YYYY-MM-DD" key. */
export function keyDayNumber(key: string): number {
  return Number(key.slice(8, 10));
}

/**
 * Relative day label: "النهارده" / "بكرة" / "بعد بكرة" / "امبارح" /
 * weekday name for anything further. Negative = past.
 */
export function relativeDayFromKey(key: string): string {
  const diff = Math.round((keyToMs(key) - keyToMs(todayKey())) / 86_400_000);
  if (diff === 0) return 'النهارده';
  if (diff === 1) return 'بكرة';
  if (diff === 2) return 'بعد بكرة';
  if (diff === -1) return 'امبارح';
  return WEEKDAYS_AR[keyWeekday(key)];
}

/** Relative day label from an ISO datetime (day of that datetime). */
export function relativeDay(iso: string | null | undefined): string {
  if (!iso) return '';
  return relativeDayFromKey(iso.slice(0, 10));
}

/** Day key of an ISO datetime (the wall-clock date part). */
export function isoDayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Hour (0..23) of an ISO datetime by Cairo wall clock. */
export function isoHour(iso: string): number {
  return new Date(iso).getUTCHours();
}

/**
 * Build a Cairo wall-clock datetime string: "YYYY-MM-DDTHH:mm:00.000Z".
 * `time` is "HH:mm" or "HH:mm:ss".
 */
export function buildIso(dayKey: string, time: string): string {
  const [h = '00', m = '00', s = '00'] = time.split(':');
  return `${dayKey}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:${s.padStart(2, '0')}.000Z`;
}

/** ISO → "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
export function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  return `${iso.slice(0, 10)}T${iso.slice(11, 16)}`;
}

/** "YYYY-MM-DDTHH:mm" (datetime-local input) → ISO wall-clock string. */
export function fromLocalInputValue(value: string): string | null {
  if (!value || value.length < 16) return null;
  return `${value.slice(0, 10)}T${value.slice(11, 16)}:00.000Z`;
}

/** Human deadline: "بكرة 10:00" (relative day + time). */
export function fmtDeadline(iso: string | null | undefined): string {
  if (!iso) return '';
  return `${relativeDay(iso)} ${fmtTime(iso)}`;
}

/** "10 ص" / "2 م" style hour label for timeline slots. */
export function fmtHourShort(iso: string): string {
  const h = new Date(iso).getUTCHours();
  if (h === 0) return '12 ص';
  if (h === 12) return '12 م';
  return h < 12 ? `${h} ص` : `${h - 12} م`;
}

/** Current hour (0..23) in Cairo wall clock — for greetings etc. */
export function cairoHourNow(): number {
  const parts = Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const hour = parts.find((p) => p.type === 'hour')?.value;
  return Number(hour ?? 0);
}
