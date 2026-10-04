import type { PrismaClient } from '@prisma/client';
import type {
  CreateExpenseData,
  CreateIncomeData,
  DateRange,
  IFinanceRepository,
} from '../../domain/repositories';
import type { ExpenseRecord, IncomeRecord } from '../../domain/types';
import type { ExpenseCategory, Recurrence } from '../../domain/enums';

interface ExpenseRow {
  id: string;
  userId: string;
  amount: number;
  category: string;
  description: string | null;
  date: Date;
  isRecurring: boolean;
  recurrence: string | null;
  nextDueAt: Date | null;
  createdAt: Date;
}

interface IncomeRow {
  id: string;
  userId: string;
  amount: number;
  source: string | null;
  description: string | null;
  date: Date;
  createdAt: Date;
}

export class PrismaFinanceRepository implements IFinanceRepository {
  constructor(private readonly db: PrismaClient) {}

  async listExpenses(userId: string, range?: DateRange): Promise<ExpenseRecord[]> {
    const expenses = await this.db.expense.findMany({
      where: {
        userId,
        ...(range?.from || range?.to
          ? { date: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } }
          : {}),
      },
      orderBy: { date: 'desc' },
    });
    return expenses.map((e) => this.toExpense(e));
  }

  async createExpense(userId: string, data: CreateExpenseData): Promise<ExpenseRecord> {
    const expense = await this.db.expense.create({
      data: {
        userId,
        amount: data.amount,
        category: data.category as string,
        description: data.description ?? null,
        date: data.date ?? new Date(),
        isRecurring: data.isRecurring ?? false,
        recurrence: data.recurrence ?? null,
        nextDueAt: data.nextDueAt ?? null,
      },
    });
    return this.toExpense(expense);
  }

  async deleteExpense(userId: string, id: string): Promise<boolean> {
    const existing = await this.db.expense.findFirst({ where: { id, userId } });
    if (!existing) return false;
    await this.db.expense.delete({ where: { id } });
    return true;
  }

  async listIncomes(userId: string, range?: DateRange): Promise<IncomeRecord[]> {
    const incomes = await this.db.income.findMany({
      where: {
        userId,
        ...(range?.from || range?.to
          ? { date: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } }
          : {}),
      },
      orderBy: { date: 'desc' },
    });
    return incomes.map((i) => this.toIncome(i));
  }

  async createIncome(userId: string, data: CreateIncomeData): Promise<IncomeRecord> {
    const income = await this.db.income.create({
      data: {
        userId,
        amount: data.amount,
        source: data.source ?? null,
        description: data.description ?? null,
        date: data.date ?? new Date(),
      },
    });
    return this.toIncome(income);
  }

  async deleteIncome(userId: string, id: string): Promise<boolean> {
    const existing = await this.db.income.findFirst({ where: { id, userId } });
    if (!existing) return false;
    await this.db.income.delete({ where: { id } });
    return true;
  }

  async getBudgetAmount(userId: string, month: number, year: number): Promise<number | null> {
    const budget = await this.db.budget.findUnique({
      where: { userId_month_year: { userId, month, year } },
    });
    return budget?.amount ?? null;
  }

  async setBudgetAmount(userId: string, month: number, year: number, amount: number): Promise<void> {
    await this.db.budget.upsert({
      where: { userId_month_year: { userId, month, year } },
      create: { userId, month, year, amount },
      update: { amount },
    });
  }

  private toExpense(e: ExpenseRow): ExpenseRecord {
    return {
      id: e.id,
      userId: e.userId,
      amount: e.amount,
      category: e.category as ExpenseCategory,
      description: e.description,
      date: e.date,
      isRecurring: e.isRecurring,
      recurrence: (e.recurrence as Recurrence | null) ?? null,
      nextDueAt: e.nextDueAt,
      createdAt: e.createdAt,
    };
  }

  private toIncome(i: IncomeRow): IncomeRecord {
    return {
      id: i.id,
      userId: i.userId,
      amount: i.amount,
      source: i.source,
      description: i.description,
      date: i.date,
      createdAt: i.createdAt,
    };
  }
}
