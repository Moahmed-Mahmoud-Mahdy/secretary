import { ValidationError } from '../../domain/errors';
import { serializePlanSlot } from '../../domain/services/serialize';
import { generateDayPlan } from '../../domain/services/planner';
import {
  dayKeyOf,
  endOfDay,
  nowWall,
  parseDayKey,
  parseWallIso,
  startOfDay,
} from '../../domain/services/time';
import type { DayPlanDTO, PlanSlotDTO, TaskRecord, WeekPlanDTO } from '../../domain/types';
import type { IEventRepository, IPlanRepository, ITaskRepository } from '../../domain/repositories';
import { eventOccurrenceOnDay } from '../../domain/services/recurrence';

// ============================================================
// AI Planning use cases (BRD §13, §16) — build a day plan from
// open tasks + fixed events + available time; support
// re-planning when tasks were missed.
// ============================================================

/** Plannable waking window (wall-clock, Cairo): 08:00 → 23:00. */
const PLAN_DAY_START_HOUR = 8;
const PLAN_DAY_END_HOUR = 23;

export class PlanningUseCases {
  constructor(
    private readonly tasks: ITaskRepository,
    private readonly events: IEventRepository,
    private readonly plans: IPlanRepository
  ) {}

  async getDayPlan(userId: string, dayKeyStr?: string): Promise<DayPlanDTO> {
    const day = startOfDay(dayKeyStr ? parseWallIso(dayKeyStr) : nowWall());
    const [slots, tasks] = await Promise.all([
      this.plans.listSlotsForDay(userId, day, endOfDay(day)),
      this.tasks.listAll(userId),
    ]);
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const slotDTOs: PlanSlotDTO[] = slots
      .map((s) => {
        const task = taskMap.get(s.taskId);
        return serializePlanSlot(s, task?.title ?? 'مهمة', task?.priority ?? 'MEDIUM', task ?? null);
      })
      .sort((a, b) => a.startAt.localeCompare(b.startAt));

    const plannedTaskIds = new Set(slots.map((s) => s.taskId));
    const doneTaskIds = new Set(slots.filter((s) => s.status === 'DONE').map((s) => s.taskId));
    const unplanned = tasks
      .filter(
        (t) =>
          t.parentId === null &&
          (t.status === 'TODO' || t.status === 'IN_PROGRESS') &&
          !plannedTaskIds.has(t.id) &&
          !doneTaskIds.has(t.id)
      )
      .map((t) => ({ id: t.id, title: t.title }))
      .slice(0, 10);

    const now = nowWall();
    const plannedMinutes = slots
      .filter((s) => s.status !== 'MISSED')
      .reduce((sum, s) => sum + Math.max(0, Math.round((s.endAt.getTime() - s.startAt.getTime()) / 60000)), 0);
    const busyMinutes = await this.busyMinutes(userId, day);
    const dayMinutes = 15 * 60; // 8:00 → 23:00
    const freeMinutes = Math.max(0, dayMinutes - busyMinutes - plannedMinutes);

    return {
      date: dayKeyOf(day),
      slots: slotDTOs,
      unplanned,
      plannedMinutes,
      freeMinutes,
    };
  }

  /** 7-day overview for the weekly planner grid (BRD §16). */
  async getWeekPlan(userId: string, startKeyStr?: string, days = 7): Promise<WeekPlanDTO> {
    const start = startOfDay(startKeyStr ? parseWallIso(startKeyStr) : nowWall());
    const cappedDays = Math.max(1, Math.min(14, days));
    const end = endOfDay(new Date(start.getTime() + (cappedDays - 1) * 86_400_000));
    const [slots, tasks] = await Promise.all([
      this.plans.listSlotsForDay(userId, start, end),
      this.tasks.listAll(userId),
    ]);
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const dayBuckets = new Map<string, PlanSlotDTO[]>();
    for (let i = 0; i < cappedDays; i += 1) {
      dayBuckets.set(dayKeyOf(new Date(start.getTime() + i * 86_400_000)), []);
    }
    for (const s of slots) {
      const key = dayKeyOf(s.startAt);
      const bucket = dayBuckets.get(key);
      if (!bucket) continue;
      const task = taskMap.get(s.taskId);
      bucket.push(serializePlanSlot(s, task?.title ?? 'مهمة', task?.priority ?? 'MEDIUM', task ?? null));
    }

    const outDays: WeekPlanDTO['days'] = [...dayBuckets.entries()].map(([date, daySlots]) => {
      daySlots.sort((a, b) => a.startAt.localeCompare(b.startAt));
      const plannedMinutes = daySlots
        .filter((s) => s.status !== 'MISSED')
        .reduce((sum, s) => sum + Math.max(0, Math.round((new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / 60000)), 0);
      return { date, slots: daySlots, plannedMinutes };
    });

    return { start: dayKeyOf(start), days: outDays };
  }

  /**
   * (Re)generate the plan for a day — misses are re-planned, done slots are kept.
   * Auto-planning fills the waking window (08:00 → 23:00). `pinned` reserves a
   * specific interval for one task (e.g. an explicitly postponed "at 17:00") —
   * the rest of the day is planned around it.
   */
  async generatePlan(
    userId: string,
    dayKeyStr?: string,
    opts?: { pinned?: { taskId: string; start: Date; end: Date } }
  ): Promise<DayPlanDTO> {
    const day = startOfDay(dayKeyStr ? parseWallIso(dayKeyStr) : nowWall());
    const now = nowWall();
    const dayEnd = endOfDay(day);
    const planStart = new Date(day.getTime() + PLAN_DAY_START_HOUR * 3_600_000);
    const planEnd = new Date(day.getTime() + PLAN_DAY_END_HOUR * 3_600_000);

    const [tasks, events] = await Promise.all([this.tasks.listAll(userId), this.events.listAll(userId)]);

    // Fixed-event occurrences for the day are immovable (BRD §15).
    const busy = events
      .map((e) => eventOccurrenceOnDay(e, day))
      .filter((occ): occ is NonNullable<typeof occ> => occ !== null)
      .map((occ) => ({ start: occ.start, end: occ.end ?? new Date(occ.start.getTime() + 60 * 60_000) }));

    // A pinned interval is honoured only when it lands inside the day and
    // doesn't collide with a fixed event — otherwise we fall back to regular
    // planning and let the greedy planner find a gap.
    const pin = opts?.pinned;
    const pinValid =
      pin !== undefined &&
      pin.start >= day &&
      pin.end <= dayEnd &&
      pin.start >= new Date(Math.max(day.getTime(), Math.min(now.getTime(), dayEnd.getTime()))) &&
      !busy.some((b) => pin.start < b.end && pin.end > b.start);

    if (pinValid && pin) busy.push({ start: pin.start, end: pin.end });

    // Existing DONE slots stay put; everything else gets rebuilt.
    const existingSlots = await this.plans.listSlotsForDay(userId, day, dayEnd);
    const doneSlots = existingSlots.filter((s) => s.status === 'DONE');
    const doneTaskIds = new Set(doneSlots.map((s) => s.taskId));
    for (const done of doneSlots) busy.push({ start: done.startAt, end: done.endAt });

    const openTasks = tasks.filter(
      (t) =>
        t.parentId === null &&
        (t.status === 'TODO' || t.status === 'IN_PROGRESS') &&
        !doneTaskIds.has(t.id) &&
        !(pinValid && pin && t.id === pin.taskId) &&
        this.fitsDay(t, day)
    );

    const plan = generateDayPlan({
      dayStart: planStart,
      dayEnd: planEnd,
      now,
      busy,
      tasks: openTasks.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        estimatedMinutes: t.estimatedMinutes,
        deadline: t.deadline,
      })),
    });

    await this.plans.replaceDaySlots(
      userId,
      day,
      [
        ...plan.slots.map((s) => ({ taskId: s.taskId, startAt: s.start, endAt: s.end })),
        ...(pinValid && pin ? [{ taskId: pin.taskId, startAt: pin.start, endAt: pin.end }] : []),
      ]
    );

    return this.getDayPlan(userId, dayKeyOf(day));
  }

  /**
   * Schedule ONE task into the target day without touching the rest of the
   * plan (used by POSTPONE — predictable, no side effects on other slots).
   * Prefers the pinned start when given (and free), otherwise the first gap
   * after it / in the waking window 08:00 → 23:00. Returns the created slot
   * or null when the day has no room.
   */
  async scheduleTaskInDay(
    userId: string,
    taskId: string,
    dayKeyStr: string,
    opts?: { pinnedStart?: Date | null }
  ): Promise<PlanSlotDTO | null> {
    const day = startOfDay(parseWallIso(dayKeyStr));
    const dayEnd = endOfDay(day);
    const now = nowWall();
    const planStart = new Date(day.getTime() + PLAN_DAY_START_HOUR * 3_600_000);
    const planEnd = new Date(day.getTime() + PLAN_DAY_END_HOUR * 3_600_000);

    const tasks = await this.tasks.listAll(userId);
    const task = tasks.find((t) => t.id === taskId && t.parentId === null);
    if (!task || (task.status !== 'TODO' && task.status !== 'IN_PROGRESS')) return null;

    const durationMin = Math.min(Math.max(task.estimatedMinutes ?? 45, 15), 240);
    const durationMs = durationMin * 60_000;
    // Earliest auto-plannable moment: now (today) or 08:00 (future days).
    const earliest = new Date(Math.max(planStart.getTime(), Math.min(now.getTime(), planEnd.getTime())));

    const events = await this.events.listAll(userId);
    const busy: { start: Date; end: Date }[] = events
      .map((e) => eventOccurrenceOnDay(e, day))
      .filter((occ): occ is NonNullable<typeof occ> => occ !== null)
      .map((occ) => ({ start: occ.start, end: occ.end ?? new Date(occ.start.getTime() + 60 * 60_000) }));

    const slots = await this.plans.listSlotsForDay(userId, day, dayEnd);
    for (const s of slots) {
      if (s.status === 'PLANNED' || s.status === 'DONE') busy.push({ start: s.startAt, end: s.endAt });
    }

    const overlaps = (start: Date, end: Date): boolean =>
      busy.some((b) => start < b.end && end > b.start);

    const pin = opts?.pinnedStart ?? null;
    let chosen: { start: Date; end: Date } | null = null;

    // 1) Honour an explicit requested hour when it's inside the day and free.
    if (pin) {
      const pinEnd = new Date(pin.getTime() + durationMs);
      const floor = new Date(Math.max(day.getTime(), Math.min(now.getTime(), dayEnd.getTime())));
      if (pin >= floor && pinEnd <= dayEnd && !overlaps(pin, pinEnd)) {
        chosen = { start: pin, end: pinEnd };
      }
    }

    // 2) First-fit: next free gap (after the requested hour when pinned).
    if (!chosen) {
      const cursor = pin && pin > earliest ? pin : earliest;
      const sortedBusy = [...busy].sort((a, b) => a.start.getTime() - b.start.getTime());
      let point = cursor.getTime();
      for (const b of sortedBusy) {
        if (b.end.getTime() <= point) continue;
        if (b.start.getTime() - point >= durationMs && point + durationMs <= planEnd.getTime()) {
          chosen = { start: new Date(point), end: new Date(point + durationMs) };
          break;
        }
        if (b.end.getTime() > point) point = b.end.getTime();
      }
      if (!chosen && point + durationMs <= planEnd.getTime()) {
        chosen = { start: new Date(point), end: new Date(point + durationMs) };
      }
    }

    if (!chosen) return null;
    const created = await this.plans.createSlot(userId, task.id, chosen.start, chosen.end);
    return serializePlanSlot(created, task.title, task.priority, task);
  }

  async markSlot(userId: string, slotId: string, status: string): Promise<void> {
    const allowed = ['PLANNED', 'DONE', 'MISSED'];
    if (!allowed.includes(status)) throw new ValidationError('حالة الخانة مش معروفة');
    const ok = await this.plans.updateSlotStatus(userId, slotId, status as 'PLANNED' | 'DONE' | 'MISSED');
    if (!ok) throw new ValidationError('الخانة دي مش موجودة');
  }

  private fitsDay(task: TaskRecord, day: Date): boolean {
    // Only schedule tasks whose deadline is today or later (or no deadline).
    if (!task.deadline) return true;
    const deadlineDay = dayKeyOf(task.deadline);
    return deadlineDay >= dayKeyOf(day);
  }

  private async busyMinutes(userId: string, day: Date): Promise<number> {
    const events = await this.events.listAll(userId);
    let minutes = 0;
    for (const e of events) {
      const occ = eventOccurrenceOnDay(e, day);
      if (!occ) continue;
      const end = occ.end ?? new Date(occ.start.getTime() + 60 * 60_000);
      minutes += Math.max(0, Math.round((end.getTime() - occ.start.getTime()) / 60000));
    }
    return minutes;
  }
}
