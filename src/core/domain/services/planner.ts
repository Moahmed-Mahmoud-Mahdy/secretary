import type { Priority } from '../enums';

// ============================================================
// Deterministic day planner (pure domain logic).
// Places open tasks into free gaps between fixed events.
// ============================================================

export interface PlannerBusyInterval {
  start: Date;
  end: Date;
}

export interface PlannerTask {
  id: string;
  title: string;
  priority: Priority;
  estimatedMinutes: number | null;
  deadline: Date | null;
}

export interface PlannerInput {
  dayStart: Date;
  dayEnd: Date;
  now: Date;
  busy: PlannerBusyInterval[];
  tasks: PlannerTask[];
}

export interface PlannedSlot {
  taskId: string;
  start: Date;
  end: Date;
}

export interface PlannerOutput {
  slots: PlannedSlot[];
  unplannedTaskIds: string[];
}

const MIN_SLOT_MINUTES = 15;
const MAX_SLOT_MINUTES = 240;
const DEFAULT_DURATION_MINUTES = 45;

const PRIORITY_WEIGHT: Record<Priority, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function roundUpToNext5(d: Date): Date {
  const ms = 5 * 60_000;
  return new Date(Math.ceil(d.getTime() / ms) * ms);
}

function clampDuration(task: PlannerTask): number {
  const raw = task.estimatedMinutes ?? DEFAULT_DURATION_MINUTES;
  return Math.min(Math.max(raw, MIN_SLOT_MINUTES), MAX_SLOT_MINUTES);
}

function sortTasks(tasks: PlannerTask[], now: Date): PlannerTask[] {
  return [...tasks].sort((a, b) => {
    const aOverdue = a.deadline !== null && a.deadline < now ? 1 : 0;
    const bOverdue = b.deadline !== null && b.deadline < now ? 1 : 0;
    if (aOverdue !== bOverdue) return bOverdue - aOverdue; // overdue first
    const aDeadline = a.deadline?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bDeadline = b.deadline?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (aDeadline !== bDeadline) return aDeadline - bDeadline; // nearest deadline first
    const prioDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (prioDiff !== 0) return prioDiff;
    return (b.estimatedMinutes ?? 0) - (a.estimatedMinutes ?? 0); // bigger tasks first
  });
}

/** Greedy first-fit scheduling into free gaps. */
export function generateDayPlan(input: PlannerInput): PlannerOutput {
  const windowStart = roundUpToNext5(input.now > input.dayStart ? input.now : input.dayStart);
  const free: { start: Date; end: Date }[] =
    windowStart < input.dayEnd ? [{ start: windowStart, end: new Date(input.dayEnd.getTime()) }] : [];

  const consume = (start: Date, end: Date): void => {
    for (let i = 0; i < free.length; i += 1) {
      const gap = free[i];
      if (start >= gap.start && end <= gap.end) {
        const replacement: { start: Date; end: Date }[] = [];
        if (gap.start < start) replacement.push({ start: gap.start, end: start });
        if (end < gap.end) replacement.push({ start: end, end: gap.end });
        free.splice(i, 1, ...replacement);
        return;
      }
    }
  };

  const sortedBusy = [...input.busy].sort((a, b) => a.start.getTime() - b.start.getTime());
  for (const interval of sortedBusy) {
    const start = interval.start > windowStart ? interval.start : windowStart;
    const end = interval.end < input.dayEnd ? interval.end : input.dayEnd;
    if (start < end) consume(start, end);
  }

  const slots: PlannedSlot[] = [];
  const unplannedTaskIds: string[] = [];

  for (const task of sortTasks(input.tasks, input.now)) {
    const duration = clampDuration(task);
    const gap = free.find((g) => g.end.getTime() - g.start.getTime() >= duration * 60_000);
    if (!gap) {
      unplannedTaskIds.push(task.id);
      continue;
    }
    const slotStart = new Date(gap.start.getTime());
    const slotEnd = new Date(gap.start.getTime() + duration * 60_000);
    slots.push({ taskId: task.id, start: slotStart, end: slotEnd });
    consume(slotStart, slotEnd);
  }

  slots.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { slots, unplannedTaskIds };
}
