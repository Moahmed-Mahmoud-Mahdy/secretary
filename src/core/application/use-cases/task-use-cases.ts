import { NotFoundError, ValidationError } from '../../domain/errors';
import { serializeTask } from '../../domain/services/serialize';
import { nowWall } from '../../domain/services/time';
import type {
  TaskDTO,
  TaskRecord,
} from '../../domain/types';
import type { Priority, Recurrence, TaskStatus } from '../../domain/enums';
import {
  PRIORITIES,
  RECURRENCES,
  TASK_STATUSES,
} from '../../domain/enums';
import type { ITaskRepository, IPlanRepository, CreateTaskData, UpdateTaskData } from '../../domain/repositories';

// ============================================================
// Task use cases — CRUD + completion with recurring-instance
// materialization.
// ============================================================

export class TaskUseCases {
  constructor(
    private readonly tasks: ITaskRepository,
    private readonly projects: { listAll(userId: string): Promise<{ id: string; name: string }[]> },
    private readonly plans: IPlanRepository
  ) {}

  async list(userId: string, filters?: { status?: string; projectId?: string }): Promise<TaskDTO[]> {
    const all = await this.tasks.listAll(userId);
    const projectMap = new Map((await this.projects.listAll(userId)).map((p) => [p.id, p.name]));
    const parents = all.filter((t) => t.parentId === null);
    let result = parents.map((t) => serializeTask(t, all, projectMap.get(t.projectId ?? '') ?? null));
    if (filters?.status) {
      const status = filters.status;
      if (status === 'OVERDUE') result = result.filter((t) => t.isOverdue);
      else if (status === 'OPEN') result = result.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS');
      else result = result.filter((t) => t.status === status);
    }
    if (filters?.projectId) result = result.filter((t) => t.projectId === filters.projectId);
    return result;
  }

  async create(
    userId: string,
    input: {
      title: string;
      description?: string | null;
      priority?: string;
      estimatedMinutes?: number | null;
      deadline?: string | null;
      reminderAt?: string | null;
      recurrence?: string | null;
      tags?: string[] | null;
      projectId?: string | null;
      parentId?: string | null;
    }
  ): Promise<TaskDTO> {
    const title = input.title?.trim();
    if (!title) throw new ValidationError('المهمة لازم يكون ليها عنوان');
    if (title.length > 200) throw new ValidationError('العنوان طويل أوي');

    const data: CreateTaskData = {
      title,
      description: input.description?.trim() || null,
      priority: this.validatePriority(input.priority),
      estimatedMinutes: this.validateDuration(input.estimatedMinutes),
      deadline: this.parseDate(input.deadline),
      reminderAt: this.parseDate(input.reminderAt),
      recurrence: this.validateRecurrence(input.recurrence),
      tags: input.tags && input.tags.length > 0 ? input.tags.join(',') : null,
      projectId: input.projectId ?? null,
      parentId: input.parentId ?? null,
    };

    const created = await this.tasks.create(userId, data);
    return serializeTask(created);
  }

  async update(
    userId: string,
    id: string,
    input: {
      title?: string;
      description?: string | null;
      priority?: string;
      status?: string;
      estimatedMinutes?: number | null;
      deadline?: string | null;
      recurrence?: string | null;
      projectId?: string | null;
    }
  ): Promise<TaskDTO> {
    const existing = await this.tasks.findById(userId, id);
    if (!existing) throw new NotFoundError('المهمة دي مش موجودة');

    const data: UpdateTaskData = {};
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new ValidationError('العنوان مينفعش يكون فاضي');
      data.title = title;
    }
    if (input.description !== undefined) data.description = input.description?.trim() || null;
    if (input.priority !== undefined) data.priority = this.validatePriority(input.priority);
    if (input.estimatedMinutes !== undefined) data.estimatedMinutes = this.validateDuration(input.estimatedMinutes);
    if (input.deadline !== undefined) data.deadline = this.parseDate(input.deadline);
    if (input.recurrence !== undefined) data.recurrence = this.validateRecurrence(input.recurrence);
    if (input.projectId !== undefined) data.projectId = input.projectId;
    if (input.status !== undefined) {
      data.status = this.validateStatus(input.status);
      data.completedAt =
        data.status === 'COMPLETED' ? (existing.completedAt ?? nowWall()) : null;
    }

    const updated = await this.tasks.update(userId, id, data);
    if (!updated) throw new NotFoundError('المهمة دي مش موجودة');

    // Recurring task completed → materialize the next instance.
    if (data.status === 'COMPLETED' && updated.recurrence && updated.parentId === null) {
      await this.materializeNextRecurrence(userId, updated);
    }

    return serializeTask(updated);
  }

  async delete(userId: string, id: string): Promise<void> {
    const deleted = await this.tasks.delete(userId, id);
    if (!deleted) throw new NotFoundError('المهمة دي مش موجودة');
  }

  /** Fuzzy-match a spoken/written task name against open tasks (AI flows). */
  async matchByTitle(userId: string, needle: string): Promise<TaskRecord | null> {
    const all = await this.tasks.listAll(userId);
    return matchTaskTitle(all, needle);
  }

  private async materializeNextRecurrence(userId: string, task: TaskRecord): Promise<void> {
    if (!task.recurrence) return;
    const base = task.deadline ?? task.completedAt ?? nowWall();
    const next = new Date(base.getTime());
    if (task.recurrence === 'DAILY') next.setUTCDate(next.getUTCDate() + 1);
    if (task.recurrence === 'WEEKLY') next.setUTCDate(next.getUTCDate() + 7);
    if (task.recurrence === 'MONTHLY') next.setUTCMonth(next.getUTCMonth() + 1);
    await this.tasks.create(userId, {
      title: task.title,
      description: task.description,
      priority: task.priority,
      estimatedMinutes: task.estimatedMinutes,
      deadline: next,
      reminderAt: task.reminderAt,
      recurrence: task.recurrence,
      tags: task.tags,
      projectId: task.projectId,
    });
  }

  private validatePriority(value?: string | null): Priority {
    if (!value) return 'MEDIUM';
    const upper = value.toUpperCase();
    if (!(PRIORITIES as readonly string[]).includes(upper)) throw new ValidationError(`الأولوية "${value}" مش معروفة`);
    return upper as Priority;
  }

  private validateStatus(value: string): TaskStatus {
    const upper = value.toUpperCase();
    if (!(TASK_STATUSES as readonly string[]).includes(upper)) throw new ValidationError(`الحالة "${value}" مش معروفة`);
    return upper as TaskStatus;
  }

  private validateRecurrence(value?: string | null): Recurrence | null {
    if (!value) return null;
    const upper = value.toUpperCase();
    if (!(RECURRENCES as readonly string[]).includes(upper)) return null;
    return upper as Recurrence;
  }

  private validateDuration(value?: number | null): number | null {
    if (value === null || value === undefined) return null;
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.min(Math.round(value), 24 * 60);
  }

  private parseDate(value?: string | null): Date | null {
    if (!value) return null;
    try {
      const normalized = value.length === 10 ? `${value}T23:59:59` : value;
      const d = new Date(normalized.endsWith('Z') ? normalized : normalized.replace(' ', 'T'));
      if (Number.isNaN(d.getTime())) return null;
      return d;
    } catch {
      return null;
    }
  }
}

/** Normalized Arabic title matching — strips ال prefix, tatweel & extra spaces. */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[ًٌٍَُِّْٰ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\u0640/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function matchTaskTitle(tasks: TaskRecord[], needle: string): TaskRecord | null {
  const target = normalizeArabic(needle);
  if (!target) return null;
  const open = tasks.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS');
  const scored = open
    .map((task) => {
      const title = normalizeArabic(task.title);
      let score = 0;
      if (title === target) score = 100;
      else if (title.includes(target)) score = 80;
      else if (target.includes(title) && title.length >= 3) score = 70;
      else {
        const words = target.split(' ').filter((w) => w.length >= 3);
        const hits = words.filter((w) => title.includes(w)).length;
        if (words.length > 0) score = (hits / words.length) * 60;
      }
      return { task, score };
    })
    .filter((s) => s.score >= 50)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.task ?? null;
}
