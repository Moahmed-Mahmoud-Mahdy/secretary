'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Flame,
  Loader2,
  Repeat,
  Trash2,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  apiErrorMessage,
  endpoints,
  isAuthError,
  type DayPlanDTO,
  type EventDTO,
  type FinanceSummaryDTO,
  type HabitDTO,
  type OccurrenceDTO,
  type PlanSlotDTO,
  type Recurrence,
  type WeekPlanDTO,
} from '@/lib/sekretir/api';
import { CATEGORY_META, RECURRENCE_LABELS, RECURRENCE_OPTIONS, fmtMoney, streakCountLabel } from '@/lib/sekretir/constants';
import {
  addDaysKey,
  cairoHourNow,
  fmtTime,
  keyDayNumber,
  monthLabel,
  relativeDay,
  relativeDayFromKey,
  todayKey,
  weekdayInitial,
  weekdayName,
} from '@/lib/sekretir/date-utils';
import { FadeIn } from '@/components/sekretir/fade-in';
import { cn } from '@/lib/utils';

/** Client-side occurrence expansion for events on a given day (wall-clock keys). */
function eventOccursOn(ev: EventDTO, dayKey: string): boolean {
  const startDay = ev.startAt.slice(0, 10);
  if (dayKey < startDay) return false;
  if (!ev.recurrence) return dayKey === startDay;
  const dayMs = Date.UTC(
    Number(dayKey.slice(0, 4)),
    Number(dayKey.slice(5, 7)) - 1,
    Number(dayKey.slice(8, 10))
  );
  const startMs = Date.UTC(
    Number(startDay.slice(0, 4)),
    Number(startDay.slice(5, 7)) - 1,
    Number(startDay.slice(8, 10))
  );
  if (ev.recurrence === 'DAILY') return dayMs >= startMs;
  if (ev.recurrence === 'WEEKLY') {
    const DAY = 86_400_000;
    return (dayMs - startMs) % (7 * DAY) === 0;
  }
  if (ev.recurrence === 'MONTHLY') return dayKey.slice(8, 10) === startDay.slice(8, 10);
  return dayKey === startDay;
}

function eventToOccurrence(ev: EventDTO, dayKey: string): OccurrenceDTO {
  return {
    key: `event-${ev.id}-${dayKey}`,
    kind: 'EVENT',
    refId: ev.id,
    eventId: ev.id,
    title: ev.title,
    startAt: ev.startAt,
    endAt: ev.endAt,
    eventType: ev.eventType,
    isRecurring: Boolean(ev.recurrence),
  };
}

function slotToOccurrence(slot: PlanSlotDTO): OccurrenceDTO {
  return {
    key: `slot-${slot.id}`,
    kind: 'PLANNED_TASK',
    refId: slot.id,
    taskId: slot.taskId,
    title: slot.taskTitle,
    startAt: slot.startAt,
    endAt: slot.endAt,
    status: slot.status,
    priority: slot.priority,
    taskIsTracking: slot.taskIsTracking,
    taskTrackingStartedAt: slot.taskTrackingStartedAt,
  };
}

/** Sunday-anchored week start for a wall-clock day key (Egyptian week). */
function weekStartKey(key: string): string {
  const ms = Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
  const offset = new Date(ms).getUTCDay(); // 0=Sunday
  return addDaysKey(key, -offset);
}

/**
 * Celebration burst on habit check-in (BRD §16) — amber/emerald palette,
 * particle count scales with the streak so milestones feel bigger.
 */
function celebrateStreak(streak: number): void {
  if (typeof window === 'undefined') return;
  const intensity = Math.min(5, 1 + Math.floor(streak / 3));
  const colors = ['#f59e0b', '#fbbf24', '#fde68a', '#10b981', '#6ee7b7'];
  const base = { colors, ticks: 120, gravity: 0.9, scalar: 0.9, zIndex: 9999 };
  void confetti({
    ...base,
    particleCount: 40 + intensity * 20,
    spread: 65 + intensity * 8,
    origin: { x: 0.25, y: 0.7 },
    angle: 60,
  });
  void confetti({
    ...base,
    particleCount: 40 + intensity * 20,
    spread: 65 + intensity * 8,
    origin: { x: 0.75, y: 0.7 },
    angle: 120,
  });
  if (streak >= 7) {
    // milestone week+: a golden rain from the top
    void confetti({ ...base, particleCount: 90, spread: 100, startVelocity: 35, origin: { x: 0.5, y: 0.15 } });
  }
}

interface CalendarViewProps {
  refreshKey: number;
  onAuthError: () => void;
  /** Deep-link: jump the day strip to this day key (from global search). */
  focusDate?: string | null;
  onFocusDateConsumed?: () => void;
}

export function CalendarView({ refreshKey, onAuthError, focusDate, onFocusDateConsumed }: CalendarViewProps) {
  const [selectedKey, setSelectedKey] = useState(todayKey());
  const [mode, setMode] = useState<'day' | 'week' | 'recurring'>('day');
  const [events, setEvents] = useState<EventDTO[]>([]);
  const [plan, setPlan] = useState<DayPlanDTO | null>(null);
  const [weekPlan, setWeekPlan] = useState<WeekPlanDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotBusy, setSlotBusy] = useState<string | null>(null);

  // recurring hub (المتكرر)
  const [habits, setHabits] = useState<HabitDTO[]>([]);
  const [financeSummary, setFinanceSummary] = useState<FinanceSummaryDTO | null>(null);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [checkinBusy, setCheckinBusy] = useState<string | null>(null);

  // event edit dialog
  const [editEvent, setEditEvent] = useState<EventDTO | null>(null);
  const [editForm, setEditForm] = useState({ title: '', startTime: '', endTime: '', notes: '' });
  const [savingEvent, setSavingEvent] = useState(false);
  const [deleteEvent, setDeleteEvent] = useState<EventDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  // add event dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ title: '', date: '', startTime: '', endTime: '', recurrence: 'none' });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ events: evs }, planData] = await Promise.all([
        endpoints.events(),
        endpoints.dayPlan(selectedKey),
      ]);
      setEvents(evs);
      setPlan(planData);
    } catch (e) {
      if (isAuthError(e)) {
        onAuthError();
        return;
      }
      toast.error(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [selectedKey, onAuthError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Week grid data (slots per day) — only needed in week mode.
  const weekDaysKey = weekStartKey(selectedKey);
  useEffect(() => {
    if (mode !== 'week') return;
    let cancelled = false;
    endpoints
      .weekPlan(weekDaysKey)
      .then((data) => {
        if (!cancelled) setWeekPlan(data);
      })
      .catch((e) => {
        if (isAuthError(e)) {
          onAuthError();
          return;
        }
        toast.error(apiErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [mode, weekDaysKey, refreshKey, onAuthError, selectedKey]);

  // Week strip: 7 days starting from week anchor
  const today = todayKey();

  // Global-search deep-link: jump to the requested day once.
  useEffect(() => {
    if (focusDate) {
      setSelectedKey(focusDate);
      setMode('day');
      onFocusDateConsumed?.();
    }
  }, [focusDate]);

  const weekStart = weekStartKey(selectedKey);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysKey(weekStart, i));

  // Recurring hub data — only fetched in المتكرر mode.
  const loadRecurring = useCallback(async () => {
    setRecurringLoading(true);
    try {
      const [{ habits: hbs }, fin] = await Promise.all([endpoints.habits(), endpoints.financeSummary()]);
      setHabits(hbs);
      setFinanceSummary(fin);
    } catch (e) {
      if (isAuthError(e)) {
        onAuthError();
        return;
      }
      toast.error(apiErrorMessage(e));
    } finally {
      setRecurringLoading(false);
    }
  }, [onAuthError]);

  useEffect(() => {
    if (mode === 'recurring') void loadRecurring();
  }, [mode, loadRecurring, refreshKey]);

  const recurringEvents = events.filter((ev) => ev.recurrence !== null);
  // Upcoming recurring commitments from the finance summary (global, not month-scoped).
  const recurringExpenses = financeSummary?.upcomingRecurring ?? [];
  const recurringMonthlyTotal = recurringExpenses.reduce((s, x) => s + x.amount, 0);

  /** First occurrence day (>= today) of a recurring event, searching 60 days ahead. */
  function nextEventDay(ev: EventDTO): string | null {
    for (let i = 0; i <= 60; i += 1) {
      const k = addDaysKey(today, i);
      if (eventOccursOn(ev, k)) return k;
    }
    return null;
  }

  /** Habit check-in: complete today's instance — backend materializes the next one. */
  async function checkinTask(t: HabitDTO) {
    if (checkinBusy) return;
    setCheckinBusy(t.id);
    try {
      await endpoints.updateTask(t.id, { status: 'COMPLETED' });
      const newStreak = t.streak > 0 ? t.streak + 1 : 1;
      celebrateStreak(newStreak);
      // Evening rescue: checking in a due, alive streak habit late at night
      // is a "caught up" save (BRD §16 — streak-at-risk companion).
      const isEveningRescue = cairoHourNow() >= 20 && t.isDueToday && t.streak >= 2;
      toast.success(
        isEveningRescue
          ? `لحقت على السلسلة! 🔥 «${t.title}» بقت ${newStreak} ${streakCountLabel(t.recurrence, newStreak)} — كان قريب يقع!`
          : t.streak > 0
            ? `برافو! سلسلة «${t.title}» وصلت ${newStreak} ${streakCountLabel(t.recurrence, newStreak)} 🔥`
            : `برافو! خلصت «${t.title}» النهارده 🔥`,
        { description: 'سجلتلك الجاية في معادها' }
      );
      await loadRecurring();
    } catch (e) {
      if (isAuthError(e)) {
        onAuthError();
        return;
      }
      toast.error(apiErrorMessage(e));
    } finally {
      setCheckinBusy(null);
    }
  }

  const agenda: OccurrenceDTO[] = [
    ...events.filter((ev) => eventOccursOn(ev, selectedKey)).map((ev) => eventToOccurrence(ev, selectedKey)),
    ...(plan?.slots ?? []).map(slotToOccurrence),
  ].sort((a, b) => a.startAt.localeCompare(b.startAt));

  async function updateSlot(slotId: string, status: 'DONE' | 'MISSED' | 'PLANNED') {
    setSlotBusy(slotId);
    try {
      await endpoints.updateSlot(slotId, status);
      toast.success(status === 'DONE' ? 'برافو! خلصتها ✅' : 'اتشالت من الخطة');
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setSlotBusy(null);
    }
  }

  function openEditEvent(ev: EventDTO) {
    setEditForm({
      title: ev.title,
      startTime: ev.startAt.slice(11, 16),
      endTime: ev.endAt ? ev.endAt.slice(11, 16) : '',
      notes: ev.notes ?? '',
    });
    setEditEvent(ev);
  }

  async function saveEvent() {
    if (!editEvent || savingEvent) return;
    if (!editForm.title.trim()) {
      toast.error('العنوان مينفعش يكون فاضي');
      return;
    }
    setSavingEvent(true);
    try {
      await endpoints.updateEvent(editEvent.id, {
        title: editForm.title.trim(),
        startTime: editForm.startTime,
        endTime: editForm.endTime || null,
        notes: editForm.notes.trim() || null,
      });
      setEditEvent(null);
      toast.success('اتعدل الموعد ✅');
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setSavingEvent(false);
    }
  }

  async function confirmDeleteEvent() {
    if (!deleteEvent || deleting) return;
    setDeleting(true);
    try {
      await endpoints.deleteEvent(deleteEvent.id);
      setDeleteEvent(null);
      setEditEvent(null);
      toast.success('الحدث اتشال 🗑️');
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  async function addEvent() {
    if (!addForm.title.trim() || !addForm.date || !addForm.startTime || adding) return;
    setAdding(true);
    try {
      await endpoints.createEvent({
        title: addForm.title.trim(),
        date: addForm.date,
        startTime: addForm.startTime,
        endTime: addForm.endTime || null,
        recurrence: addForm.recurrence === 'none' ? null : (addForm.recurrence as Recurrence),
      });
      setAddOpen(false);
      setAddForm({ title: '', date: selectedKey, startTime: '', endTime: '', recurrence: 'none' });
      toast.success('ضفت الموعد 📌');
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-extrabold text-stone-900">التقويم</h1>
        <div className="flex items-center gap-2">
          {/* Day/Week/Recurring mode toggle */}
          <div className="flex items-center rounded-full border border-stone-200 bg-white p-0.5" role="tablist" aria-label="عرض التقويم">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'day'}
              onClick={() => setMode('day')}
              className={cn(
                'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition-colors',
                mode === 'day' ? 'bg-amber-600 text-white shadow-sm' : 'text-stone-500 hover:bg-stone-100'
              )}
            >
              <CalendarPlus className="size-3.5" />
              يوم
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'week'}
              onClick={() => setMode('week')}
              className={cn(
                'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition-colors',
                mode === 'week' ? 'bg-amber-600 text-white shadow-sm' : 'text-stone-500 hover:bg-stone-100'
              )}
            >
              <CalendarDays className="size-3.5" />
              أسبوع
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'recurring'}
              onClick={() => setMode('recurring')}
              className={cn(
                'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition-colors',
                mode === 'recurring' ? 'bg-amber-600 text-white shadow-sm' : 'text-stone-500 hover:bg-stone-100'
              )}
            >
              <Repeat className="size-3.5" />
              المتكرر
            </button>
          </div>
          <Button
            className="bg-amber-600 hover:bg-amber-700 text-white rounded-full"
            onClick={() => {
              setAddForm({ title: '', date: selectedKey, startTime: '', endTime: '', recurrence: 'none' });
              setAddOpen(true);
            }}
          >
            <CalendarPlus className="size-4" />
            ضيف موعد
          </Button>
        </div>
      </div>

      {/* Week strip */}
      <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
        <CardContent className="p-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-stone-500 hover:bg-stone-100 shrink-0"
              onClick={() => setSelectedKey(addDaysKey(selectedKey, -7))}
              aria-label="الأسبوع اللي فات"
            >
              <ChevronRight className="size-4" />
            </Button>
            <div className="grid grid-cols-7 flex-1 gap-1">
              {weekDays.map((k) => {
                const selected = k === selectedKey;
                const isToday = k === today;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelectedKey(k)}
                    aria-pressed={selected}
                    className={cn(
                      'flex flex-col items-center justify-center rounded-xl py-2 transition-colors min-h-[52px]',
                      selected
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'text-stone-600 hover:bg-stone-100',
                      !selected && isToday && 'ring-2 ring-amber-300'
                    )}
                  >
                    <span className={cn('text-[10px] font-bold', selected ? 'text-amber-100' : 'text-stone-400')}>
                      {weekdayInitial(k)}
                    </span>
                    <span className="text-sm font-extrabold tabular-nums">{keyDayNumber(k)}</span>
                  </button>
                );
              })}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-stone-500 hover:bg-stone-100 shrink-0"
              onClick={() => setSelectedKey(addDaysKey(selectedKey, 7))}
              aria-label="الأسبوع الجاي"
            >
              <ChevronLeft className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Week grid view */}
      {mode === 'week' ? (
        <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <CardContent className="p-3 sm:p-4">
            {/* Week header: range + weekly load + quick jumps */}
            {(() => {
              const weekTotalMin = weekPlan?.days.reduce((s, d) => s + d.plannedMinutes, 0) ?? 0;
              const weekIsCurrent = weekStart === weekStartKey(today);
              return (
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-sm font-extrabold text-stone-800 whitespace-nowrap">
                      {keyDayNumber(weekDays[0])} — {keyDayNumber(weekDays[6])} {monthLabel(weekDays[6].slice(0, 7))}
                    </h3>
                    {weekTotalMin > 0 ? (
                      <span
                        className="rounded-full bg-amber-50 border border-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 tabular-nums whitespace-nowrap"
                        title="إجمالي الوقت المخطط في الأسبوع ده"
                      >
                        ⏳ {Math.round(weekTotalMin / 60)} سا مخططة
                      </span>
                    ) : null}
                    {weekIsCurrent ? (
                      <span className="rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">الأسبوع الحالي</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-full text-xs text-stone-600 hover:bg-stone-100"
                      onClick={() => setSelectedKey(addDaysKey(selectedKey, -7))}
                      aria-label="انتقل للأسبوع اللي فات"
                    >
                      <ChevronRight className="size-3.5" />
                      اللي فات
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={weekIsCurrent}
                      className="h-7 rounded-full text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-40"
                      onClick={() => setSelectedKey(todayKey())}
                    >
                      النهارده
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-full text-xs text-stone-600 hover:bg-stone-100"
                      onClick={() => setSelectedKey(addDaysKey(selectedKey, 7))}
                      aria-label="انتقل للأسبوع الجاي"
                    >
                      الجاي
                      <ChevronLeft className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })()}
            <div className="overflow-x-auto -mx-1 px-1 pb-1" style={{ scrollbarWidth: 'thin' }}>
              <div className="grid grid-cols-7 gap-1.5 min-w-[640px]">
                {weekDays.map((k) => {
                  const isToday = k === today;
                  const isSelected = k === selectedKey;
                  const daySlots = weekPlan?.days.find((d) => d.date === k)?.slots ?? [];
                  const dayPlannedMin = weekPlan?.days.find((d) => d.date === k)?.plannedMinutes ?? 0;
                  const dayOccurrences: OccurrenceDTO[] = [
                    ...events.filter((ev) => eventOccursOn(ev, k)).map((ev) => eventToOccurrence(ev, k)),
                    ...daySlots.map(slotToOccurrence),
                  ].sort((a, b) => a.startAt.localeCompare(b.startAt));
                  return (
                    <div
                      key={k}
                      className={cn(
                        'rounded-xl border flex flex-col min-h-[180px]',
                        isToday ? 'border-amber-300 bg-amber-50/40' : 'border-stone-100 bg-stone-50/40'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedKey(k);
                          setMode('day');
                        }}
                        className={cn(
                          'flex items-center justify-center gap-1.5 rounded-t-xl py-2 text-xs font-bold transition-colors',
                          isSelected
                            ? 'bg-amber-600 text-white'
                            : isToday
                              ? 'text-amber-700 hover:bg-amber-100'
                              : 'text-stone-500 hover:bg-stone-100'
                        )}
                        aria-label={`افتح يوم ${weekdayName(k)}`}
                      >
                        <span>{weekdayInitial(k)}</span>
                        <span className="tabular-nums">{keyDayNumber(k)}</span>
                      </button>
                      <div className="flex-1 p-1 space-y-1">
                        {dayOccurrences.length === 0 ? (
                          <p className="text-center text-[10px] text-stone-300 pt-4">فاضي</p>
                        ) : (
                          dayOccurrences.slice(0, 5).map((occ) => {
                            const isEvent = occ.kind === 'EVENT';
                            const done = occ.status === 'DONE';
                            const missed = occ.status === 'MISSED';
                            return (
                              <div
                                key={occ.key}
                                title={`${fmtTime(occ.startAt)} ${occ.title}`}
                                className={cn(
                                  'rounded-lg px-1.5 py-1 text-[10px] leading-tight border transition-colors',
                                  isEvent
                                    ? 'bg-amber-100/80 border-amber-200 text-amber-900'
                                    : done
                                      ? 'bg-stone-100 border-stone-200 text-stone-400 line-through'
                                      : missed
                                        ? 'bg-stone-100 border-stone-200 text-stone-400 opacity-70'
                                        : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                )}
                              >
                                <span className="font-bold tabular-nums block">{fmtTime(occ.startAt)}</span>
                                <span className="block truncate">{occ.title}</span>
                              </div>
                            );
                          })
                        )}
                        {dayOccurrences.length > 5 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedKey(k);
                              setMode('day');
                            }}
                            className="text-[10px] font-bold text-amber-600 hover:text-amber-700 w-full text-center pt-0.5"
                          >
                            +{dayOccurrences.length - 5} كمان
                          </button>
                        ) : null}
                      </div>
                      {dayPlannedMin > 0 ? (
                        <p className="text-center text-[9px] text-stone-400 pb-1.5 tabular-nums">
                          ⏳ {Math.round(dayPlannedMin / 60)} سا
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-[11px] text-stone-400 mt-2 text-center">
              دوس على أي يوم لتفتح تفاصيله — 🟡 مواعيد ثابتة • 🟢 مهام مخططة
            </p>
          </CardContent>
        </Card>
      ) : mode === 'recurring' ? (
        /* ---------- المتكرر hub (BRD §16): habits, recurring events & bills ---------- */
        <div className="space-y-4">
          {recurringLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-28 rounded-2xl" />
            </div>
          ) : (
            <>
              {/* Habits — recurring tasks with check-in + streaks (BRD §16) */}
              <FadeIn>
                <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-1">
                      <h2 className="font-bold text-stone-800 flex items-center gap-2">
                        <span className="size-8 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center" aria-hidden>
                          <Flame className="size-4 text-orange-600" />
                        </span>
                        عاداتك المتكررة
                      </h2>
                      <span className="text-xs font-bold text-stone-400">{habits.length}</span>
                    </div>
                    <p className="text-xs text-stone-400 mb-3">
                      علّم على العادة كل ما تخلصها — وسكرتير يحسبلك سلسلتك ويسجلها الجاية في معادها.
                    </p>
                    {habits.length === 0 ? (
                      <p className="py-6 text-center text-sm text-stone-400">
                        مفيش عادات متكررة لسه — قول لسكرتير «فتكر يوميًا أذاكر ساعة» 🔄
                      </p>
                    ) : (
                      <ul className="space-y-2 sekretir-scroll max-h-80 overflow-y-auto">
                        {habits.map((t) => {
                          const isDueToday = t.isDueToday;
                          const unit =
                            t.recurrence === 'DAILY' ? 'يوم' : t.recurrence === 'WEEKLY' ? 'أسبوع' : 'شهر';
                          return (
                            <li
                              key={t.id}
                              className={cn(
                                'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-200',
                                isDueToday
                                  ? 'border-amber-200 bg-amber-50/50 hover:bg-amber-50 hover:shadow-sm'
                                  : 'border-stone-100 bg-stone-50/50 hover:bg-stone-50 hover:shadow-sm'
                              )}
                            >
                              <span className="text-lg shrink-0" aria-hidden>
                                {isDueToday ? '🔥' : '🔄'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-stone-800 truncate">{t.title}</p>
                                <p className="text-[10px] text-stone-400">
                                  {RECURRENCE_LABELS[t.recurrence as Recurrence]}
                                  {t.deadline ? ` • الجاي ${relativeDay(t.deadline)} ${fmtTime(t.deadline)}` : ''}
                                  {t.estimatedMinutes ? ` • ${t.estimatedMinutes} د` : ''}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                {t.streak > 0 ? (
                                  <span
                                    className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-orange-100 border border-orange-200 text-orange-700 tabular-nums"
                                    title={`أطول سلسلة: ${t.bestStreak} ${unit}`}
                                  >
                                    🔥 {t.streak} {streakCountLabel(t.recurrence as Recurrence, t.streak)}
                                  </span>
                                ) : t.totalCompletions > 0 ? (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-500">
                                    أفضل: {t.bestStreak} {unit}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-400">
                                    أول مرة
                                  </span>
                                )}
                                <Button
                                  size="sm"
                                  disabled={checkinBusy === t.id}
                                  onClick={() => checkinTask(t)}
                                  className={cn(
                                    'h-8 rounded-full text-xs w-full',
                                    isDueToday
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                      : 'bg-stone-100 hover:bg-stone-200 text-stone-600'
                                  )}
                                >
                                  {checkinBusy === t.id ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    'خلصتها ✅'
                                  )}
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </FadeIn>

              {/* Recurring fixed events */}
              <FadeIn delay={0.08}>
                <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200">
                  <CardContent className="p-4 sm:p-5">
                    <h2 className="font-bold text-stone-800 flex items-center gap-2 mb-3">
                      <span className="size-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center" aria-hidden>
                        <Repeat className="size-4 text-amber-600" />
                      </span>
                      مواعيد ثابتة متكررة
                    </h2>
                    {recurringEvents.length === 0 ? (
                      <p className="py-6 text-center text-sm text-stone-400">مفيش مواعيد متكررة — ضيف موعد وحدد له تكرار 📅</p>
                    ) : (
                      <ul className="space-y-2 sekretir-scroll max-h-72 overflow-y-auto">
                        {recurringEvents.map((ev) => {
                          const next = nextEventDay(ev);
                          return (
                            <li
                              key={ev.id}
                              className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2.5 hover:bg-amber-50 transition-colors"
                            >
                              <span className="size-9 rounded-xl bg-white border border-amber-100 flex items-center justify-center text-base shrink-0" aria-hidden>
                                📌
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-stone-800 truncate">{ev.title}</p>
                                <p className="text-[10px] text-stone-400">
                                  {RECURRENCE_LABELS[ev.recurrence as Recurrence]} • {fmtTime(ev.startAt)}
                                  {ev.endAt ? ` – ${fmtTime(ev.endAt)}` : ''}
                                </p>
                              </div>
                              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white border border-amber-200 text-amber-700 shrink-0">
                                {next ? relativeDayFromKey(next) : '—'}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </FadeIn>

              {/* Recurring financial commitments */}
              <FadeIn delay={0.16}>
                <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-1">
                      <h2 className="font-bold text-stone-800 flex items-center gap-2">
                        <span className="size-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center" aria-hidden>
                          <Wallet className="size-4 text-emerald-600" />
                        </span>
                        التزاماتك المالية المتكررة
                      </h2>
                      {recurringMonthlyTotal > 0 ? (
                        <span className="text-xs font-extrabold text-rose-600 tabular-nums">
                          {fmtMoney(recurringMonthlyTotal)} ج/شهر
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-stone-400 mb-3">دي اللي بتتسحب منك كل شهر — سكرتير حاسبها في ميزانيتك.</p>
                    {recurringExpenses.length === 0 ? (
                      <p className="py-6 text-center text-sm text-stone-400">
                        مفيش التزامات متكررة — سجل فاتورة النت كمصروف متكرر وهنا هنا 💡
                      </p>
                    ) : (
                      <ul className="space-y-2 sekretir-scroll max-h-72 overflow-y-auto">
                        {recurringExpenses.map((x) => {
                          const meta = CATEGORY_META[x.category];
                          return (
                            <li
                              key={x.id}
                              className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 px-3 py-2.5 hover:bg-emerald-50 transition-colors"
                            >
                              <span className="size-9 rounded-xl bg-white border border-emerald-100 flex items-center justify-center text-base shrink-0" aria-hidden>
                                {meta.icon}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-stone-800 truncate">
                                  {x.description || meta.label}
                                </p>
                                <p className="text-[10px] text-stone-400">
                                  {x.recurrence ? RECURRENCE_LABELS[x.recurrence as Recurrence] : 'بتتكرر'}
                                  {x.nextDueAt ? ` • الجاي ${relativeDay(x.nextDueAt)}` : ''}
                                </p>
                              </div>
                              <span className="text-sm font-extrabold text-rose-600 tabular-nums shrink-0">
                                −{fmtMoney(x.amount)} ج
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </FadeIn>
            </>
          )}
        </div>
      ) : (
      <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
        <CardContent className="p-4 sm:p-5">
          <h2 className="font-bold text-stone-800 mb-1">
            {weekdayName(selectedKey)} — {relativeDayFromKey(selectedKey)}
          </h2>

          {loading ? (
            <div className="space-y-2 mt-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : agenda.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-3xl mb-2" aria-hidden>📭</p>
              <p className="text-sm text-stone-400">يوم فاضي خالص — استغله في حاجة حلوة 😌</p>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {agenda.map((occ) => {
                const isEvent = occ.kind === 'EVENT';
                const done = occ.kind === 'PLANNED_TASK' && occ.status === 'DONE';
                const missed = occ.kind === 'PLANNED_TASK' && occ.status === 'MISSED';
                return (
                  <li
                    key={occ.key}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 flex items-start gap-2.5',
                      isEvent
                        ? 'border-amber-200 bg-amber-50/60'
                        : done
                          ? 'border-stone-200 bg-stone-50'
                          : 'border-emerald-200 bg-emerald-50/60'
                    )}
                  >
                    {occ.kind === 'PLANNED_TASK' ? (
                      <Checkbox
                        checked={done}
                        disabled={slotBusy === occ.refId}
                        onCheckedChange={() => updateSlot(occ.refId, done ? 'PLANNED' : 'DONE')}
                        className="mt-0.5 size-5 shrink-0 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                        aria-label="خلصت المهمة"
                      />
                    ) : (
                      <span className="text-lg leading-none mt-0.5 shrink-0" aria-hidden>
                        📌
                      </span>
                    )}

                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'font-semibold text-sm break-words',
                          done ? 'line-through text-stone-400' : isEvent ? 'text-stone-800' : 'text-emerald-900'
                        )}
                      >
                        {occ.kind === 'PLANNED_TASK' ? '🤖 ' : ''}
                        {occ.title}
                      </p>
                      <p className="text-xs text-stone-500 tabular-nums mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>
                          {fmtTime(occ.startAt)}
                          {occ.endAt ? ` – ${fmtTime(occ.endAt)}` : ''}
                          {occ.isRecurring ? ' • 🔁 متكرر' : ''}
                        </span>
                        {occ.kind === 'PLANNED_TASK' && occ.taskIsTracking && occ.taskTrackingStartedAt ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700">
                            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
                            شغّال {Math.max(1, Math.floor((Date.now() - new Date(occ.taskTrackingStartedAt).getTime()) / 60000))} د
                          </span>
                        ) : null}
                      </p>
                    </div>

                    {isEvent ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-amber-700 hover:bg-amber-100"
                          onClick={() => {
                            const ev = events.find((x) => x.id === occ.eventId);
                            if (ev) openEditEvent(ev);
                          }}
                        >
                          تعديل
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-stone-300 hover:text-rose-600 hover:bg-rose-50"
                          onClick={() => {
                            const ev = events.find((x) => x.id === occ.eventId);
                            if (ev) setDeleteEvent(ev);
                          }}
                          aria-label="امسح الحدث"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ) : occ.status === 'PLANNED' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={slotBusy === occ.refId}
                        className="h-7 text-xs text-stone-500 hover:bg-stone-200/60 shrink-0"
                        onClick={() => updateSlot(occ.refId, 'MISSED')}
                      >
                        شيله من الخطة
                      </Button>
                    ) : missed ? (
                      <span className="text-[10px] font-bold text-stone-400 shrink-0 mt-1">اتشالت</span>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-600 shrink-0 mt-1">خلصت ✅</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {plan && plan.slots.length > 0 ? (
            <p className="text-xs text-stone-400 mt-3 border-t border-stone-100 pt-3">
              ⏳ مخطط {Math.round(plan.plannedMinutes / 60)} سا • فاضي {Math.round(plan.freeMinutes / 60)} سا
              {plan.unplanned.length > 0 ? ` • ${plan.unplanned.length} مهمة بره الخطة` : ''}
            </p>
          ) : null}
        </CardContent>
      </Card>
      )}

      {/* Edit event dialog */}
      <Dialog open={editEvent !== null} onOpenChange={(o) => !o && setEditEvent(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>عدّل الموعد 📌</DialogTitle>
            <DialogDescription>عدّل بيانات الحدث واحفظ.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="ev-title">العنوان</Label>
              <Input
                id="ev-title"
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ev-start">من الساعة</Label>
                <Input
                  id="ev-start"
                  type="time"
                  dir="ltr"
                  value={editForm.startTime}
                  onChange={(e) => setEditForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ev-end">لحد الساعة</Label>
                <Input
                  id="ev-end"
                  type="time"
                  dir="ltr"
                  value={editForm.endTime}
                  onChange={(e) => setEditForm((f) => ({ ...f, endTime: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-notes">ملاحظات</Label>
              <Input
                id="ev-notes"
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="اختياري"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditEvent(null)}>
              إلغاء
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={saveEvent}
              disabled={savingEvent}
            >
              {savingEvent ? <Loader2 className="size-4 animate-spin" /> : null}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add event dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>موعد ثابت جديد 📌</DialogTitle>
            <DialogDescription>محاضرة، شغل، موعد دكتور... اللي يشهّيك.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="add-ev-title">العنوان</Label>
              <Input
                id="add-ev-title"
                value={addForm.title}
                onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="مثلاً: محاضرة Algorithms"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="add-ev-date">اليوم</Label>
                <Input
                  id="add-ev-date"
                  type="date"
                  dir="ltr"
                  value={addForm.date}
                  onChange={(e) => setAddForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-ev-start">من</Label>
                <Input
                  id="add-ev-start"
                  type="time"
                  dir="ltr"
                  value={addForm.startTime}
                  onChange={(e) => setAddForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-ev-end">لحد</Label>
                <Input
                  id="add-ev-end"
                  type="time"
                  dir="ltr"
                  value={addForm.endTime}
                  onChange={(e) => setAddForm((f) => ({ ...f, endTime: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>التكرار</Label>
              <Select
                value={addForm.recurrence}
                onValueChange={(v) => setAddForm((f) => ({ ...f, recurrence: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون</SelectItem>
                  {RECURRENCE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      🔁 {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              إلغاء
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={addEvent}
              disabled={adding || !addForm.title.trim() || !addForm.startTime}
            >
              {adding ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}
              ضيف الموعد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete event confirm */}
      <Dialog open={deleteEvent !== null} onOpenChange={(o) => !o && setDeleteEvent(null)}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>تمسح «{deleteEvent?.title}»؟ 🗑️</DialogTitle>
            <DialogDescription>
              الحدث هيتشال من التقويم
              {deleteEvent?.recurrence ? ' — وحتى التكرارات الجاية' : ''}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteEvent(null)}>
              سيبه
            </Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={confirmDeleteEvent}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              امسح
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
