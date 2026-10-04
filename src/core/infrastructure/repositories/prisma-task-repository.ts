import type { PrismaClient } from '@prisma/client';
import type { CreateTaskData, ITaskRepository, UpdateTaskData } from '../../domain/repositories';
import type { TaskRecord } from '../../domain/types';
import type { Priority, Recurrence, TaskStatus } from '../../domain/enums';

interface TaskRow {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  estimatedMinutes: number | null;
  deadline: Date | null;
  reminderAt: Date | null;
  recurrence: string | null;
  tags: string | null;
  projectId: string | null;
  parentId: string | null;
  actualMinutes: number;
  trackingStartedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class PrismaTaskRepository implements ITaskRepository {
  constructor(private readonly db: PrismaClient) {}

  async listAll(userId: string): Promise<TaskRecord[]> {
    const tasks = await this.db.task.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }],
    });
    return tasks.map((t) => this.toRecord(t));
  }

  async findById(userId: string, id: string): Promise<TaskRecord | null> {
    const task = await this.db.task.findFirst({ where: { id, userId } });
    return task ? this.toRecord(task) : null;
  }

  async create(userId: string, data: CreateTaskData): Promise<TaskRecord> {
    const task = await this.db.task.create({
      data: {
        userId,
        title: data.title,
        description: data.description ?? null,
        priority: (data.priority ?? 'MEDIUM') as string,
        status: (data.status ?? 'TODO') as string,
        estimatedMinutes: data.estimatedMinutes ?? null,
        deadline: data.deadline ?? null,
        reminderAt: data.reminderAt ?? null,
        recurrence: data.recurrence ?? null,
        tags: data.tags ?? null,
        projectId: data.projectId ?? null,
        parentId: data.parentId ?? null,
      },
    });
    return this.toRecord(task);
  }

  async update(userId: string, id: string, data: UpdateTaskData): Promise<TaskRecord | null> {
    const existing = await this.db.task.findFirst({ where: { id, userId } });
    if (!existing) return null;
    const updated = await this.db.task.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        priority: data.priority as string | undefined,
        status: data.status as string | undefined,
        estimatedMinutes: data.estimatedMinutes,
        deadline: data.deadline,
        reminderAt: data.reminderAt,
        recurrence: data.recurrence,
        tags: data.tags,
        projectId: data.projectId,
        completedAt: data.completedAt,
        actualMinutes: data.actualMinutes,
        trackingStartedAt: data.trackingStartedAt,
      },
    });
    return this.toRecord(updated);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const existing = await this.db.task.findFirst({ where: { id, userId } });
    if (!existing) return false;
    await this.db.task.delete({ where: { id } });
    return true;
  }

  private toRecord(t: TaskRow): TaskRecord {
    return {
      id: t.id,
      userId: t.userId,
      title: t.title,
      description: t.description,
      priority: t.priority as Priority,
      status: t.status as TaskStatus,
      estimatedMinutes: t.estimatedMinutes,
      deadline: t.deadline,
      reminderAt: t.reminderAt,
      recurrence: (t.recurrence as Recurrence | null) ?? null,
      tags: t.tags,
      projectId: t.projectId,
      parentId: t.parentId,
      actualMinutes: t.actualMinutes,
      trackingStartedAt: t.trackingStartedAt,
      completedAt: t.completedAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }
}
