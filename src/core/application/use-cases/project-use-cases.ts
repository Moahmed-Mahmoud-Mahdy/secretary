import { NotFoundError, ValidationError } from '../../domain/errors';
import { serializeProject } from '../../domain/services/serialize';
import type { ProjectDTO, TaskRecord } from '../../domain/types';
import type { Priority } from '../../domain/enums';
import { PRIORITIES } from '../../domain/enums';
import type { CreateProjectData, IProjectRepository, ITaskRepository } from '../../domain/repositories';

// ============================================================
// Project use cases — CRUD + progress computed from tasks.
// ============================================================

export class ProjectUseCases {
  constructor(
    private readonly projects: IProjectRepository,
    private readonly tasks: ITaskRepository
  ) {}

  async list(userId: string): Promise<ProjectDTO[]> {
    const [projects, tasks] = await Promise.all([this.projects.listAll(userId), this.tasks.listAll(userId)]);
    return projects.map((p) => serializeProject(p, tasks));
  }

  async get(userId: string, id: string): Promise<{ project: ProjectDTO; tasks: ReturnType<typeof serializeTaskOf>[] }> {
    const project = await this.projects.findById(userId, id);
    if (!project) throw new NotFoundError('المشروع ده مش موجود');
    const tasks = (await this.tasks.listAll(userId)).filter((t) => t.projectId === id);
    const projectMap = new Map([[project.id, project.name]]);
    return {
      project: serializeProject(project, tasks),
      tasks: tasks.map((t) => serializeTaskOf(t, projectMap)),
    };
  }

  async create(
    userId: string,
    input: { name: string; description?: string | null; priority?: string; deadline?: string | null }
  ): Promise<ProjectDTO> {
    const name = input.name?.trim();
    if (!name) throw new ValidationError('المشروع لازم يكون لياه اسم');
    const data: CreateProjectData = {
      name,
      description: input.description?.trim() || null,
      priority: this.validatePriority(input.priority),
      deadline: this.parseDate(input.deadline),
    };
    const created = await this.projects.create(userId, data);
    return serializeProject(created, []);
  }

  async update(
    userId: string,
    id: string,
    input: { name?: string; description?: string | null; priority?: string; status?: string; deadline?: string | null }
  ): Promise<ProjectDTO> {
    const existing = await this.projects.findById(userId, id);
    if (!existing) throw new NotFoundError('المشروع ده مش موجود');
    const data: Partial<CreateProjectData> = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new ValidationError('الاسم مينفعش يكون فاضي');
      data.name = name;
    }
    if (input.description !== undefined) data.description = input.description?.trim() || null;
    if (input.priority !== undefined) data.priority = this.validatePriority(input.priority);
    if (input.status !== undefined) data.status = this.validateStatus(input.status);
    if (input.deadline !== undefined) data.deadline = this.parseDate(input.deadline);
    const updated = await this.projects.update(userId, id, data);
    if (!updated) throw new NotFoundError('المشروع ده مش موجود');
    const tasks = await this.tasks.listAll(userId);
    return serializeProject(updated, tasks);
  }

  /** Deleting a project detaches its tasks (never destroys user data silently). */
  async delete(userId: string, id: string): Promise<void> {
    const tasks = await this.tasks.listAll(userId);
    const projectTasks = tasks.filter((t) => t.projectId === id);
    await Promise.all(projectTasks.map((t) => this.tasks.update(userId, t.id, { projectId: null })));
    const deleted = await this.projects.delete(userId, id);
    if (!deleted) throw new NotFoundError('المشروع ده مش موجود');
  }

  private validatePriority(value?: string | null): Priority {
    if (!value) return 'MEDIUM';
    const upper = value.toUpperCase();
    if (!(PRIORITIES as readonly string[]).includes(upper)) throw new ValidationError(`الأولوية "${value}" مش معروفة`);
    return upper as Priority;
  }

  private validateStatus(value: string): ProjectDTO['status'] {
    const upper = value.toUpperCase();
    const allowed = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
    if (!allowed.includes(upper)) throw new ValidationError(`حالة المشروع "${value}" مش معروفة`);
    return upper as ProjectDTO['status'];
  }

  private parseDate(value?: string | null): Date | null {
    if (!value) return null;
    try {
      const normalized = value.length === 10 ? `${value}T23:59:59` : value;
      const d = new Date(normalized);
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
}

function serializeTaskOf(task: TaskRecord, projectMap: Map<string, string>) {
  return {
    ...serializeProjectTask(task),
    projectName: projectMap.get(task.projectId ?? '') ?? null,
  };
}

function serializeProjectTask(task: TaskRecord) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    deadline: task.deadline ? task.deadline.toISOString() : null,
    estimatedMinutes: task.estimatedMinutes,
  };
}
