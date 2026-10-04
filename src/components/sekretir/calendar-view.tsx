'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
  type OccurrenceDTO,
  type PlanSlotDTO,
  type Recurrence,
} from '@/lib/sekretir/api';
import { RECURRENCE_OPTIONS } from '@/lib/sekretir/constants';
import {
  addDaysKey,
  fmtTime,
  keyDayNumber,
  relativeDayFromKey,
  todayKey,
  weekdayInitial,
  weekdayName,
} from '@/lib/sekretir/date-utils';
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
  };
}

interface CalendarViewProps {
  refreshKey: number;
  onAuthError: () => void;
}

export function CalendarView({ refreshKey, onAuthError }: CalendarViewProps) {
  const [selectedKey, setSelectedKey] = useState(todayKey());
  const [events, setEvents] = useState<EventDTO[]>([]);
  const [plan, setPlan] = useState<DayPlanDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotBusy, setSlotBusy] = useState<string | null>(null);

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

  // Week strip: 7 days starting from week anchor
  const today = todayKey();
  const dayMs = Date.UTC(
    Number(selectedKey.slice(0, 4)),
    Number(selectedKey.slice(5, 7)) - 1,
    Number(selectedKey.slice(8, 10))
  );
  const weekdayOffset = new Date(dayMs).getUTCDay(); // 0=Sunday → weeks start Sunday
  const weekStart = addDaysKey(selectedKey, -weekdayOffset);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysKey(weekStart, i));

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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-stone-900">التقويم</h1>
        <Button
          className="bg-amber-600 hover:bg-amber-700 text-white rounded-full"
          onClick={() => {
            setAddForm({ title: '', date: selectedKey, startTime: '', endTime: '', recurrence: 'none' });
            setAddOpen(true);
          }}
        >
          <CalendarPlus className="size-4" />
          ضيف موعد ثابت
        </Button>
      </div>

      {/* Week strip */}
      <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm">
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

      {/* Agenda */}
      <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm">
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
                      <p className="text-xs text-stone-500 tabular-nums mt-0.5">
                        {fmtTime(occ.startAt)}
                        {occ.endAt ? ` – ${fmtTime(occ.endAt)}` : ''}
                        {occ.isRecurring ? ' • 🔁 متكرر' : ''}
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
