import { ValidationError } from '../../domain/errors';
import { matchesQuery } from '../../domain/services/search';
import { dayKeyOf } from '../../domain/services/time';
import type {
  SearchResultsDTO,
  SearchHitTask,
  SearchHitProject,
  SearchHitEvent,
  SearchHitExpense,
  SearchHitIncome,
} from '../../domain/types';
import type {
  IEventRepository,
  IFinanceRepository,
  IProjectRepository,
  ITaskRepository,
} from '../../domain/repositories';

// ============================================================
// Global search (BRD §43 — fast productivity helper): one query
// scans tasks / projects / events / expenses / incomes with an
// Arabic-normalized matcher. Strictly scoped to the caller's
// own data (user isolation like every other use case).
// ============================================================

const LIMIT_PER_GROUP = 6;

export class SearchUseCases {
  constructor(
    private readonly tasks: ITaskRepository,
    private readonly projects: IProjectRepository,
    private readonly events: IEventRepository,
    private readonly finance: IFinanceRepository
  ) {}

  async search(userId: string, rawQuery: string): Promise<SearchResultsDTO> {
    const query = rawQuery?.trim() ?? '';
    if (query.length < 2) throw new ValidationError('اكتب حرفين على الأقل للبحث');

    const [tasks, projects, events, expenses, incomes] = await Promise.all([
      this.tasks.listAll(userId),
      this.projects.listAll(userId),
      this.events.listAll(userId),
      this.finance.listExpenses(userId),
      this.finance.listIncomes(userId),
    ]);

    const projectNames = new Map(projects.map((p) => [p.id, p.name]));

    const hitTasks: SearchHitTask[] = tasks
      .filter(
        (t) =>
          matchesQuery(t.title, query) ||
          matchesQuery(t.description, query) ||
          (t.tags ?? '').split(',').some((tag) => matchesQuery(tag, query))
      )
      .sort((a, b) => scoreTask(b, query) - scoreTask(a, query))
      .slice(0, LIMIT_PER_GROUP)
      .map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        isOverdue:
          (t.status === 'TODO' || t.status === 'IN_PROGRESS') &&
          !!t.deadline &&
          t.deadline.getTime() < Date.now(),
        deadline: t.deadline ? t.deadline.toISOString() : null,
        projectName: t.projectId ? (projectNames.get(t.projectId) ?? null) : null,
      }));
    const hitProjects: SearchHitProject[] = projects
      .filter((p) => matchesQuery(p.name, query) || matchesQuery(p.description, query))
      .slice(0, LIMIT_PER_GROUP)
      .map((p) => ({
        id: p.id,
        name: p.name,
        progress: p.status === 'COMPLETED' ? 100 : projectProgress(p.id, tasks),
        tasksCount: tasks.filter((t) => t.projectId === p.id && t.parentId === null).length,
      }));

    const hitEvents: SearchHitEvent[] = events
      .filter((e) => matchesQuery(e.title, query) || matchesQuery(e.notes, query))
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
      .slice(0, LIMIT_PER_GROUP)
      .map((e) => ({
        id: e.id,
        title: e.title,
        startAt: e.startAt.toISOString(),
        endAt: e.endAt ? e.endAt.toISOString() : null,
      }));

    const hitExpenses: SearchHitExpense[] = expenses
      .filter((e) => matchesQuery(e.description, query))
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, LIMIT_PER_GROUP)
      .map((e) => ({
        id: e.id,
        amount: e.amount,
        category: e.category,
        description: e.description,
        date: dayKeyOf(e.date),
      }));

    const hitIncomes: SearchHitIncome[] = incomes
      .filter((i) => matchesQuery(i.source, query) || matchesQuery(i.description, query))
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, LIMIT_PER_GROUP)
      .map((i) => ({
        id: i.id,
        amount: i.amount,
        source: i.source,
        date: dayKeyOf(i.date),
      }));

    return {
      query,
      tasks: hitTasks,
      projects: hitProjects,
      events: hitEvents,
      expenses: hitExpenses,
      incomes: hitIncomes,
    };
  }
}

// ---- helpers -------------------------------------------------

function scoreTask(
  t: { title: string; status: string; deadline: Date | null; priority: string },
  query: string
): number {
  let score = 0;
  if (matchesQuery(t.title, query)) score += 10;
  if (t.status === 'TODO' || t.status === 'IN_PROGRESS') score += 3;
  if (
    (t.status === 'TODO' || t.status === 'IN_PROGRESS') &&
    t.deadline &&
    t.deadline.getTime() < Date.now()
  )
    score += 4;
  if (t.priority === 'URGENT') score += 2;
  if (t.priority === 'HIGH') score += 1;
  return score;
}

function projectProgress(
  projectId: string,
  tasks: { projectId: string | null; parentId: string | null; status: string }[]
): number {
  const own = tasks.filter((t) => t.projectId === projectId && t.parentId === null);
  if (own.length === 0) return 0;
  const done = own.filter((t) => t.status === 'COMPLETED').length;
  return Math.round((done / own.length) * 100);
}
