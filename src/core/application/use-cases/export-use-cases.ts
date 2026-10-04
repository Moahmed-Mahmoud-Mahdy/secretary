import { UnauthorizedError } from '../../domain/errors';
import { dayKeyOf } from '../../domain/services/time';
import type {
  IEventRepository,
  IFinanceRepository,
  IPlanRepository,
  IProjectRepository,
  ITaskRepository,
} from '../../domain/repositories';
import type { IUserRepository } from '../../domain/repositories';

// ============================================================
// Data export (BRD §19 — personal data ownership): a full JSON
// backup of every record the user owns. Downloaded from
// الإعدادات as sekretir-backup-<day>.json
// ============================================================

export interface ExportBundle {
  app: 'sekretir';
  version: 1;
  exportedAt: string;
  profile: { id: string; name: string; email: string; monthlyBudget: number | null; createdAt: string };
  projects: unknown[];
  tasks: unknown[];
  events: unknown[];
  expenses: unknown[];
  incomes: unknown[];
  budgets: { month: number; year: number; amount: number }[];
  categoryBudgets: { month: number; year: number; category: string; amount: number }[];
  planSlots: { taskId: string; date: string; startAt: string; endAt: string | null; status: string }[];
  notifications: unknown[];
}

export class ExportUseCases {
  constructor(
    private readonly users: IUserRepository,
    private readonly tasks: ITaskRepository,
    private readonly projects: IProjectRepository,
    private readonly events: IEventRepository,
    private readonly finance: IFinanceRepository,
    private readonly plans: IPlanRepository
  ) {}

  async exportAll(userId: string): Promise<ExportBundle> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedError();

    // Wide wall-clock range → covers every slot the user can ever have
    // (dates are Cairo wall-clock encoded as UTC).
    const from = new Date(Date.UTC(2000, 0, 1));
    const to = new Date(Date.UTC(2100, 0, 1));

    const [tasks, projects, events, expenses, incomes, slots] = await Promise.all([
      this.tasks.listAll(userId),
      this.projects.listAll(userId),
      this.events.listAll(userId),
      this.finance.listExpenses(userId),
      this.finance.listIncomes(userId),
      this.plans.listSlotsForDay(userId, from, to),
    ]);

    // Budgets live per month/year — gather for all months seen in expenses.
    const months = new Set<string>();
    for (const e of expenses) months.add(`${e.date.getUTCFullYear()}-${e.date.getUTCMonth() + 1}`);
    months.add(`${new Date().getUTCFullYear()}-${new Date().getUTCMonth() + 1}`);
    const budgets: ExportBundle['budgets'] = [];
    for (const m of months) {
      const [year, month] = m.split('-').map(Number);
      const amount = await this.finance.getBudgetAmount(userId, month, year);
      if (amount !== null) budgets.push({ month, year, amount });
    }
    const categoryBudgets = (await this.finance.listCategoryBudgets(
      userId,
      new Date().getUTCMonth() + 1,
      new Date().getUTCFullYear()
    )) as unknown as ExportBundle['categoryBudgets'];

    return {
      app: 'sekretir',
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        monthlyBudget: user.monthlyBudget,
        createdAt: user.createdAt.toISOString(),
      },
      projects,
      tasks,
      events,
      expenses,
      incomes,
      budgets,
      categoryBudgets,
      planSlots: slots.map((s) => ({
        taskId: s.taskId,
        date: dayKeyOf(s.date),
        startAt: s.startAt.toISOString(),
        endAt: s.endAt.toISOString(),
        status: s.status,
      })),
      notifications: [],
    };
  }
}
