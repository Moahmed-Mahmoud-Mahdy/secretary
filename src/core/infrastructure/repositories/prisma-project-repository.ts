import type { PrismaClient } from '@prisma/client';
import type { CreateProjectData, IProjectRepository } from '../../domain/repositories';
import type { ProjectRecord } from '../../domain/types';
import type { Priority, ProjectStatus } from '../../domain/enums';

interface ProjectRow {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  deadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class PrismaProjectRepository implements IProjectRepository {
  constructor(private readonly db: PrismaClient) {}

  async listAll(userId: string): Promise<ProjectRecord[]> {
    const projects = await this.db.project.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return projects.map((p) => this.toRecord(p));
  }

  async findById(userId: string, id: string): Promise<ProjectRecord | null> {
    const project = await this.db.project.findFirst({ where: { id, userId } });
    return project ? this.toRecord(project) : null;
  }

  async create(userId: string, data: CreateProjectData): Promise<ProjectRecord> {
    const project = await this.db.project.create({
      data: {
        userId,
        name: data.name,
        description: data.description ?? null,
        priority: (data.priority ?? 'MEDIUM') as string,
        status: (data.status ?? 'ACTIVE') as string,
        deadline: data.deadline ?? null,
      },
    });
    return this.toRecord(project);
  }

  async update(userId: string, id: string, data: Partial<CreateProjectData>): Promise<ProjectRecord | null> {
    const existing = await this.db.project.findFirst({ where: { id, userId } });
    if (!existing) return null;
    const updated = await this.db.project.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        priority: data.priority as string | undefined,
        status: data.status as string | undefined,
        deadline: data.deadline,
      },
    });
    return this.toRecord(updated);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const existing = await this.db.project.findFirst({ where: { id, userId } });
    if (!existing) return false;
    await this.db.project.delete({ where: { id } });
    return true;
  }

  private toRecord(p: ProjectRow): ProjectRecord {
    return {
      id: p.id,
      userId: p.userId,
      name: p.name,
      description: p.description,
      status: p.status as ProjectStatus,
      priority: p.priority as Priority,
      deadline: p.deadline,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}
