import { NotFoundError, ValidationError } from '../../domain/errors';
import { serializeEvent } from '../../domain/services/serialize';
import { eventOccurrenceOnDay } from '../../domain/services/recurrence';
import { endOfDay, parseWallIso, startOfDay, wallTime, dayKeyOf } from '../../domain/services/time';
import type { EventDTO, OccurrenceDTO } from '../../domain/types';
import type { Recurrence } from '../../domain/enums';
import { RECURRENCES } from '../../domain/enums';
import type { CreateEventData, IEventRepository, IPlanRepository } from '../../domain/repositories';
import type { TaskRecord } from '../../domain/types';

// ============================================================
// Calendar use cases (BRD §14, §15) — fixed events + AI-planned
// task slots merged into day occurrences (recurrence expanded).
// ============================================================

export class EventUseCases {
  constructor(
    private readonly events: IEventRepository,
    private readonly plans: IPlanRepository,
    private readonly tasks: { listAll(userId: string): Promise<TaskRecord[]> }
  ) {}

  async list(userId: string): Promise<EventDTO[]> {
    const events = await this.events.listAll(userId);
    return events.map(serializeEvent).sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  async create(
    userId: string,
    input: {
      title: string;
      date?: string;
      startAt?: string;
      startTime?: string;
      endAt?: string | null;
      endTime?: string | null;
      notes?: string | null;
      recurrence?: string | null;
      reminderAt?: string | null;
    }
  ): Promise<EventDTO> {
    const title = input.title?.trim();
    if (!title) throw new ValidationError('الحدث لازم يكون لياه عنوان');
    const startAt = this.resolveStart(input);
    if (!startAt) throw new ValidationError('لازم تحدد تاريخ وساعة الحدث');
    const endAt = this.resolveEnd(input, startAt);
    if (endAt && endAt <= startAt) throw new ValidationError('ساعة النهاية لازم تكون بعد البداية');

    const created = await this.events.create(userId, {
      title,
      notes: input.notes?.trim() || null,
      eventType: 'FIXED',
      startAt,
      endAt: endAt ?? null,
      recurrence: this.validateRecurrence(input.recurrence),
      reminderAt: this.parseDate(input.reminderAt),
    });
    return serializeEvent(created);
  }

  async update(
    userId: string,
    id: string,
    input: { title?: string; startAt?: string; endAt?: string | null; notes?: string | null; recurrence?: string | null }
  ): Promise<EventDTO> {
    const existing = await this.events.findById(userId, id);
    if (!existing) throw new NotFoundError('الحدث ده مش موجود');
    const data: Partial<CreateEventData> = {};
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new ValidationError('العنوان مينفعش يكون فاضي');
      data.title = title;
    }
    if (input.startAt !== undefined) data.startAt = parseWallIso(input.startAt);
    if (input.endAt !== undefined) data.endAt = input.endAt ? parseWallIso(input.endAt) : null;
    if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
    if (input.recurrence !== undefined) data.recurrence = this.validateRecurrence(input.recurrence);
    const updated = await this.events.update(userId, id, data);
    if (!updated) throw new NotFoundError('الحدث ده مش موجود');
    return serializeEvent(updated);
  }

  async delete(userId: string, id: string): Promise<void> {
    const deleted = await this.events.delete(userId, id);
    if (!deleted) throw new NotFoundError('الحدث ده مش موجود');
  }

  /** Merge fixed-event occurrences + planned task slots for one day, sorted. */
  async dayOccurrences(userId: string, dayKeyStr: string): Promise<OccurrenceDTO[]> {
    const day = startOfDay(parseWallIso(dayKeyStr));
    const [events, slots, tasks] = await Promise.all([
      this.events.listAll(userId),
      this.plans.listSlotsForDay(userId, day, endOfDay(day)),
      this.tasks.listAll(userId),
    ]);
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const occurrences: OccurrenceDTO[] = [];
    for (const event of events) {
      const occ = eventOccurrenceOnDay(event, day);
      if (!occ) continue;
      occurrences.push({
        key: `event-${event.id}-${dayKeyOf(occ.start)}`,
        kind: 'EVENT',
        refId: event.id,
        eventId: event.id,
        title: event.title,
        startAt: occ.start.toISOString(),
        endAt: occ.end ? occ.end.toISOString() : null,
        eventType: event.eventType,
        isRecurring: occ.isVirtual,
      });
    }
    for (const slot of slots) {
      const task = taskMap.get(slot.taskId);
      occurrences.push({
        key: `slot-${slot.id}`,
        kind: 'PLANNED_TASK',
        refId: slot.id,
        taskId: slot.taskId,
        title: task?.title ?? 'مهمة',
        startAt: slot.startAt.toISOString(),
        endAt: slot.endAt.toISOString(),
        status: slot.status,
        priority: task?.priority ?? 'MEDIUM',
      });
    }
    return occurrences.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  private resolveStart(input: { startAt?: string; date?: string; startTime?: string }): Date | null {
    if (input.startAt) return parseWallIso(input.startAt);
    if (input.date && input.startTime) return wallTime(input.date, input.startTime);
    return null;
  }

  private resolveEnd(input: { endAt?: string | null; endTime?: string | null; date?: string }, startAt: Date): Date | null {
    if (input.endAt) return parseWallIso(input.endAt);
    if (input.endTime) {
      const dayKey = input.date ?? dayKeyOf(startAt);
      return wallTime(dayKey, input.endTime);
    }
    return null;
  }

  private validateRecurrence(value?: string | null): Recurrence | null {
    if (!value) return null;
    const upper = value.toUpperCase();
    if (!(RECURRENCES as readonly string[]).includes(upper)) return null;
    return upper as Recurrence;
  }

  private parseDate(value?: string | null): Date | null {
    if (!value) return null;
    try {
      return parseWallIso(value);
    } catch {
      return null;
    }
  }
}
