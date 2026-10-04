import type { EventRecord } from '../types';
import type { Recurrence } from '../enums';

export interface DayOccurrence {
  start: Date;
  end: Date | null;
  isVirtual: boolean; // true when generated from a recurrence pattern
}

function sameWeekday(a: Date, b: Date): boolean {
  return a.getUTCDay() === b.getUTCDay();
}

function sameDayOfMonth(a: Date, b: Date): boolean {
  return a.getUTCDate() === b.getUTCDate();
}

/**
 * Does a (possibly recurring) event occur on the given day?
 * Returns the concrete occurrence times preserving the original
 * time-of-day and duration.
 */
export function eventOccurrenceOnDay(event: EventRecord, day: Date): DayOccurrence | null {
  const eventDayStart = Date.UTC(event.startAt.getUTCFullYear(), event.startAt.getUTCMonth(), event.startAt.getUTCDate());
  const targetDayStart = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());

  if (!event.recurrence) {
    if (eventDayStart !== targetDayStart) return null;
    return { start: event.startAt, end: event.endAt, isVirtual: false };
  }

  const recurrence: Recurrence = event.recurrence;
  if (targetDayStart < eventDayStart) return null; // hasn't started yet

  const timeMs = event.startAt.getTime() - eventDayStart; // ms into the day
  const start = new Date(targetDayStart + timeMs);
  const durationMs = event.endAt ? event.endAt.getTime() - event.startAt.getTime() : null;
  const end = durationMs !== null ? new Date(start.getTime() + durationMs) : null;

  switch (recurrence) {
    case 'DAILY':
      return { start, end, isVirtual: targetDayStart !== eventDayStart };
    case 'WEEKLY':
      return sameWeekday(event.startAt, start) ? { start, end, isVirtual: targetDayStart !== eventDayStart } : null;
    case 'MONTHLY':
      return sameDayOfMonth(event.startAt, start) ? { start, end, isVirtual: targetDayStart !== eventDayStart } : null;
    default:
      return null;
  }
}

/** Next due date strictly after `from` for a recurring pattern. */
export function nextOccurrenceAfter(from: Date, base: Date, recurrence: Recurrence): Date {
  const out = new Date(from.getTime());
  switch (recurrence) {
    case 'DAILY':
      out.setUTCDate(out.getUTCDate() + 1);
      return out;
    case 'WEEKLY':
      out.setUTCDate(out.getUTCDate() + 7);
      return out;
    case 'MONTHLY':
      out.setUTCMonth(out.getUTCMonth() + 1);
      return out;
    default:
      return out;
  }
}
