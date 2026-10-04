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
import type { DayPlanDTO, PlanSlotDTO, TaskRecord } from '../../domain/types';
import type { IEventRepository, IPlanRepository, ITaskRepository } from '../../domain/repositories';
import { eventOccurrenceOnDay } from '../../domain/services/recurrence';

// ============================================================
// AI Planning use cases (BRD §13, §16) — build a day plan from
// open tasks + fixed events + available time; support
// re-planning when tasks were missed.
// ============================================================

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
        return serializePlanSlot(s, task?.title ?? 'مهمة', task?.priority ?? 'MEDIUM');
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

  /** (Re)generate the plan for a day — misses are re-planned, done slots are kept. */
  async generatePlan(userId: string, dayKeyStr?: string): Promise<DayPlanDTO> {
    const day = startOfDay(dayKeyStr ? parseWallIso(dayKeyStr) : nowWall());
    const now = nowWall();
    const dayStart = day;
    const dayEnd = endOfDay(day);

    const [tasks, events] = await Promise.all([this.tasks.listAll(userId), this.events.listAll(userId)]);

    // Existing DONE slots stay put; everything else gets rebuilt.
    const existingSlots = await this.plans.listSlotsForDay(userId, dayStart, dayEnd);
    const doneSlots = existingSlots.filter((s) => s.status === 'DONE');
    const doneTaskIds = new Set(doneSlots.map((s) => s.taskId));

    // Fixed-event occurrences for the day are immovable (BRD §15).
    const busy = events
      .map((e) => eventOccurrenceOnDay(e, day))
      .filter((occ): occ is NonNullable<typeof occ> => occ !== null)
      .map((occ) => ({ start: occ.start, end: occ.end ?? new Date(occ.start.getTime() + 60 * 60_000) }));
    for (const done of doneSlots) busy.push({ start: done.startAt, end: done.endAt });

    const openTasks = tasks.filter(
      (t) =>
        t.parentId === null &&
        (t.status === 'TODO' || t.status === 'IN_PROGRESS') &&
        !doneTaskIds.has(t.id) &&
        this.fitsDay(t, day)
    );

    const plan = generateDayPlan({
      dayStart,
      dayEnd,
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
      dayStart,
      plan.slots.map((s) => ({ taskId: s.taskId, startAt: s.start, endAt: s.end }))
    );

    return this.getDayPlan(userId, dayKeyOf(day));
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
