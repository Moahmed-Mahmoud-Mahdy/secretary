import type { PrismaClient } from '@prisma/client';
import type { CreateEventData, IEventRepository } from '../../domain/repositories';
import type { EventRecord } from '../../domain/types';
import type { EventType, Recurrence } from '../../domain/enums';

interface EventRow {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  eventType: string;
  startAt: Date;
  endAt: Date | null;
  recurrence: string | null;
  reminderAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class PrismaEventRepository implements IEventRepository {
  constructor(private readonly db: PrismaClient) {}

  async listAll(userId: string): Promise<EventRecord[]> {
    const events = await this.db.calendarEvent.findMany({ where: { userId }, orderBy: { startAt: 'asc' } });
    return events.map((e) => this.toRecord(e));
  }

  async findById(userId: string, id: string): Promise<EventRecord | null> {
    const event = await this.db.calendarEvent.findFirst({ where: { id, userId } });
    return event ? this.toRecord(event) : null;
  }

  async create(userId: string, data: CreateEventData): Promise<EventRecord> {
    const event = await this.db.calendarEvent.create({
      data: {
        userId,
        title: data.title,
        notes: data.notes ?? null,
        eventType: (data.eventType ?? 'FIXED') as string,
        startAt: data.startAt,
        endAt: data.endAt ?? null,
        recurrence: data.recurrence ?? null,
        reminderAt: data.reminderAt ?? null,
      },
    });
    return this.toRecord(event);
  }

  async update(userId: string, id: string, data: Partial<CreateEventData>): Promise<EventRecord | null> {
    const existing = await this.db.calendarEvent.findFirst({ where: { id, userId } });
    if (!existing) return null;
    const updated = await this.db.calendarEvent.update({
      where: { id },
      data: {
        title: data.title,
        notes: data.notes,
        eventType: data.eventType as string | undefined,
        startAt: data.startAt,
        endAt: data.endAt,
        recurrence: data.recurrence,
        reminderAt: data.reminderAt,
      },
    });
    return this.toRecord(updated);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const existing = await this.db.calendarEvent.findFirst({ where: { id, userId } });
    if (!existing) return false;
    await this.db.calendarEvent.delete({ where: { id } });
    return true;
  }

  private toRecord(e: EventRow): EventRecord {
    return {
      id: e.id,
      userId: e.userId,
      title: e.title,
      notes: e.notes,
      eventType: e.eventType as EventType,
      startAt: e.startAt,
      endAt: e.endAt,
      recurrence: (e.recurrence as Recurrence | null) ?? null,
      reminderAt: e.reminderAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
}
