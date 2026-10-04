import { ValidationError } from '../../domain/errors';
import { serializeExpense, serializeIncome } from '../../domain/services/serialize';
import {
  endOfMonth,
  nowWall,
  startOfMonth,
} from '../../domain/services/time';
import type { ExpenseDTO, IncomeRecord, IncomeDTO, ExpenseRecord } from '../../domain/types';
import type { ExpenseCategory, Recurrence } from '../../domain/enums';
import { EXPENSE_CATEGORIES, RECURRENCES } from '../../domain/enums';
import type { IFinanceRepository, IUserRepository } from '../../domain/repositories';
import { nextOccurrenceAfter } from '../../domain/services/recurrence';

// ============================================================
// Finance use cases (BRD §19-§22) — personal finance tracker:
// expenses, income, categories, monthly budget, expected
// (recurring) expenses and summaries.
// ============================================================

export interface FinanceSummaryDTO {
  month: string;
  budget: number | null;
  monthSpent: number;
  remaining: number | null;
  spentToday: number;
  incomeThisMonth: number;
  byCategory: { category: ExpenseCategory; total: number }[];
  expectedRecurringRestOfMonth: number;
  dailyAverage: number;
  expenses: ExpenseDTO[];
  incomes: IncomeDTO[];
  upcomingRecurring: { id: string; amount: number; category: ExpenseCategory; description: string | null; nextDueAt: string | null }[];
}

export class FinanceUseCases {
  constructor(
    private readonly finance: IFinanceRepository,
    private readonly users: IUserRepository
  ) {}

  async listExpenses(userId: string, monthKey?: string): Promise<ExpenseDTO[]> {
    const range = this.monthRange(monthKey);
    const expenses = await this.finance.listExpenses(userId, range);
    return expenses.map(serializeExpense).sort((a, b) => b.date.localeCompare(a.date));
  }

  async createExpense(
    userId: string,
    input: {
      amount: number;
      category?: string;
      description?: string | null;
      date?: string | null;
      isRecurring?: boolean;
      recurrence?: string | null;
    }
  ): Promise<ExpenseDTO> {
    const amount = this.validateAmount(input.amount);
    const category = this.validateCategory(input.category);
    const date = input.date ? this.parseDate(input.date) ?? nowWall() : nowWall();
    const recurrence = this.validateRecurrence(input.recurrence);
    const isRecurring = Boolean(input.isRecurring) && recurrence !== null;
    const nextDueAt = isRecurring && recurrence ? nextOccurrenceAfter(date, date, recurrence) : null;

    const created = await this.finance.createExpense(userId, {
      amount,
      category,
      description: input.description?.trim() || null,
      date,
      isRecurring,
      recurrence: isRecurring ? recurrence : null,
      nextDueAt,
    });
    return serializeExpense(created);
  }

  async deleteExpense(userId: string, id: string): Promise<void> {
    const ok = await this.finance.deleteExpense(userId, id);
    if (!ok) throw new ValidationError('المصروف ده مش موجود');
  }

  async listIncomes(userId: string, monthKey?: string): Promise<IncomeDTO[]> {
    const range = this.monthRange(monthKey);
    const incomes = await this.finance.listIncomes(userId, range);
    return incomes.map(serializeIncome).sort((a, b) => b.date.localeCompare(a.date));
  }

  async createIncome(
    userId: string,
    input: { amount: number; source?: string | null; description?: string | null; date?: string | null }
  ): Promise<IncomeDTO> {
    const amount = this.validateAmount(input.amount);
    const date = input.date ? this.parseDate(input.date) ?? nowWall() : nowWall();
    const created = await this.finance.createIncome(userId, {
      amount,
      source: input.source?.trim() || null,
      description: input.description?.trim() || null,
      date,
    });
    return serializeIncome(created);
  }

  async deleteIncome(userId: string, id: string): Promise<void> {
    const ok = await this.finance.deleteIncome(userId, id);
    if (!ok) throw new ValidationError('الخريبة دي مش موجودة');
  }

  async setBudget(userId: string, amount: number): Promise<void> {
    const validated = this.validateAmount(amount);
    const now = nowWall();
    await this.finance.setBudgetAmount(userId, now.getUTCMonth() + 1, now.getUTCFullYear(), validated);
    await this.users.setMonthlyBudget(userId, validated);
  }

  async summary(userId: string, monthKey?: string): Promise<FinanceSummaryDTO> {
    const now = nowWall();
    const range = this.monthRange(monthKey);
    const monthStart = range.from ?? startOfMonth(now);
    const monthEnd = range.to ?? endOfMonth(now);

    const [expenses, incomes, budget, user] = await Promise.all([
      this.finance.listExpenses(userId, { from: monthStart, to: monthEnd }),
      this.finance.listIncomes(userId, { from: monthStart, to: monthEnd }),
      this.finance.getBudgetAmount(userId, monthEnd.getUTCMonth() + 1, monthEnd.getUTCFullYear()),
      this.users.findById(userId),
    ]);

    const monthSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
    const incomeThisMonth = incomes.reduce((sum, i) => sum + i.amount, 0);
    const budgetAmount = budget ?? user?.monthlyBudget ?? null;

    const dayKeyToday = now.toISOString().slice(0, 10);
    const spentToday =
      monthStart <= now && now <= monthEnd
        ? expenses
            .filter((e) => e.date.toISOString().slice(0, 10) === dayKeyToday)
            .reduce((sum, e) => sum + e.amount, 0)
        : 0;
    const isCurrentMonth = monthStart <= now && now <= monthEnd;

    const byCategoryMap = new Map<ExpenseCategory, number>();
    for (const e of expenses) {
      byCategoryMap.set(e.category, (byCategoryMap.get(e.category) ?? 0) + e.amount);
    }
    const byCategory = [...byCategoryMap.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);

    const expectedRecurringRestOfMonth = expenses
      .filter((e) => e.isRecurring && e.nextDueAt && e.nextDueAt > now && e.nextDueAt <= monthEnd)
      .reduce((sum, e) => sum + e.amount, 0);

    // Current month → average over elapsed days; past months → full length;
    // future months → nothing spent yet.
    const daysInMonth = monthEnd.getUTCDate();
    const elapsedDays = isCurrentMonth
      ? Math.max(1, now.getUTCDate())
      : daysInMonth;
    const dailyAverage = isCurrentMonth || monthSpent > 0 ? monthSpent / elapsedDays : 0;

    const upcomingRecurring = expenses
      .filter((e) => e.isRecurring && e.nextDueAt && e.nextDueAt > now)
      .sort((a, b) => (a.nextDueAt?.getTime() ?? 0) - (b.nextDueAt?.getTime() ?? 0))
      .slice(0, 8)
      .map((e) => ({
        id: e.id,
        amount: e.amount,
        category: e.category,
        description: e.description,
        nextDueAt: e.nextDueAt ? e.nextDueAt.toISOString() : null,
      }));

    return {
      month: `${monthEnd.getUTCFullYear()}-${String(monthEnd.getUTCMonth() + 1).padStart(2, '0')}`,
      budget: budgetAmount,
      monthSpent,
      remaining: budgetAmount !== null ? budgetAmount - monthSpent : null,
      spentToday,
      incomeThisMonth,
      byCategory,
      expectedRecurringRestOfMonth,
      dailyAverage,
      expenses: expenses.map(serializeExpense).sort((a, b) => b.date.localeCompare(a.date)),
      incomes: incomes.map(serializeIncome).sort((a, b) => b.date.localeCompare(a.date)),
      upcomingRecurring,
    };
  }

  private monthRange(monthKey?: string): { from?: Date; to?: Date } {
    if (!monthKey) return {};
    const m = monthKey.match(/^(\d{4})-(\d{2})$/);
    if (!m) return {};
    const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
    return { from: startOfMonth(start), to: endOfMonth(start) };
  }

  private validateAmount(value: number): number {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('المبلغ لازم يكون رقم أكبر من صفر');
    if (amount > 100_000_000) throw new ValidationError('المبلغ كبير أوي — اتأكد من الرقم');
    return Math.round(amount * 100) / 100;
  }

  private validateCategory(value?: string | null): ExpenseCategory {
    if (!value) return 'OTHER';
    const upper = value.toUpperCase();
    if (!(EXPENSE_CATEGORIES as readonly string[]).includes(upper)) return 'OTHER';
    return upper as ExpenseCategory;
  }

  private validateRecurrence(value?: string | null): Recurrence | null {
    if (!value) return null;
    const upper = value.toUpperCase();
    if (!(RECURRENCES as readonly string[]).includes(upper)) return null;
    return upper as Recurrence;
  }

  private parseDate(value: string): Date | null {
    try {
      const normalized = value.length === 10 ? `${value}T12:00:00` : value;
      const d = new Date(normalized);
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
}
