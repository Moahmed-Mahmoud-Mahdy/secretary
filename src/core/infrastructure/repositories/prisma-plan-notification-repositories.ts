import type { PrismaClient } from '@prisma/client';
import type { IPlanRepository, INotificationRepository, CreateNotificationData } from '../../domain/repositories';
import type { NotificationRecord, PlanSlotRecord } from '../../domain/types';
import type { NotificationType, PlanSlotStatus } from '../../domain/enums';

interface PlanSlotRow {
  id: string;
  userId: string;
  taskId: string;
  date: Date;
  startAt: Date;
  endAt: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class PrismaPlanRepository implements IPlanRepository {
  constructor(private readonly db: PrismaClient) {}

  async listSlotsForDay(userId: string, dayStart: Date, dayEnd: Date): Promise<PlanSlotRecord[]> {
    const slots = await this.db.planSlot.findMany({
      where: { userId, startAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { startAt: 'asc' },
    });
    return slots.map((s) => this.toRecord(s));
  }

  async listSlotsForTasks(userId: string, taskIds: string[]): Promise<PlanSlotRecord[]> {
    if (taskIds.length === 0) return [];
    const slots = await this.db.planSlot.findMany({ where: { userId, taskId: { in: taskIds } } });
    return slots.map((s) => this.toRecord(s));
  }

  /** Rebuild a day's plan: DONE slots are preserved, everything else is replaced. */
  async replaceDaySlots(
    userId: string,
    dayStart: Date,
    slots: { taskId: string; startAt: Date; endAt: Date }[]
  ): Promise<void> {
    const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1);
    await this.db.$transaction([
      this.db.planSlot.deleteMany({
        where: { userId, startAt: { gte: dayStart, lte: dayEnd }, status: { not: 'DONE' } },
      }),
      ...(slots.length > 0
        ? [this.db.planSlot.createMany({ data: slots.map((s) => ({ userId, taskId: s.taskId, startAt: s.startAt, endAt: s.endAt, date: dayStart, status: 'PLANNED' })) })]
        : []),
    ]);
  }

  async updateSlotStatus(userId: string, slotId: string, status: PlanSlotStatus): Promise<boolean> {
    const result = await this.db.planSlot.updateMany({ where: { id: slotId, userId }, data: { status } });
    return result.count > 0;
  }

  async deleteFutureSlotsForTask(userId: string, taskId: string, from: Date): Promise<number> {
    const result = await this.db.planSlot.deleteMany({
      where: { userId, taskId, startAt: { gte: from }, status: 'PLANNED' },
    });
    return result.count;
  }

  private toRecord(s: PlanSlotRow): PlanSlotRecord {
    return {
      id: s.id,
      userId: s.userId,
      taskId: s.taskId,
      date: s.date,
      startAt: s.startAt,
      endAt: s.endAt,
      status: s.status as PlanSlotStatus,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }
}

export class PrismaNotificationRepository implements INotificationRepository {
  constructor(private readonly db: PrismaClient) {}

  async listRecent(userId: string, limit = 30): Promise<NotificationRecord[]> {
    const items = await this.db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return items.map((n) => this.toRecord(n));
  }

  async listUnread(userId: string): Promise<NotificationRecord[]> {
    const items = await this.db.notification.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((n) => this.toRecord(n));
  }

  async unreadCount(userId: string): Promise<number> {
    return this.db.notification.count({ where: { userId, isRead: false } });
  }

  async createManyDeduped(userId: string, items: CreateNotificationData[]): Promise<void> {
    const refKeys = items.map((i) => i.refKey).filter((k): k is string => Boolean(k));
    const existing =
      refKeys.length > 0
        ? await this.db.notification.findMany({ where: { userId, refKey: { in: refKeys } }, select: { refKey: true } })
        : [];
    const existingSet = new Set(existing.map((e) => e.refKey));
    const toCreate = items.filter((i) => !i.refKey || !existingSet.has(i.refKey));
    if (toCreate.length === 0) return;
    await this.db.notification.createMany({
      data: toCreate.map((i) => ({
        userId,
        type: i.type as string,
        title: i.title,
        body: i.body,
        refKey: i.refKey ?? null,
      })),
    });
  }

  async markRead(userId: string, id: string): Promise<boolean> {
    const result = await this.db.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
    return result.count > 0;
  }

  async markAllRead(userId: string): Promise<void> {
    await this.db.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
  }

  private toRecord(n: {
    id: string;
    userId: string;
    type: string;
    title: string;
    body: string;
    isRead: boolean;
    refKey: string | null;
    createdAt: Date;
  }): NotificationRecord {
    return {
      id: n.id,
      userId: n.userId,
      type: n.type as NotificationType,
      title: n.title,
      body: n.body,
      isRead: n.isRead,
      refKey: n.refKey,
      createdAt: n.createdAt,
    };
  }
}
