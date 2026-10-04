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
  /** Categories with a user-set monthly limit + live spend against it. */
  categoryLimits: {
    category: ExpenseCategory;
    limit: number;
    spent: number;
    pct: number; // 0-200 capped
    over: boolean;
  }[];
  expectedRecurringRestOfMonth: number;
  dailyAverage: number;
  /** Month recap card (BRD §19 — budget vs actual report). */
  report: {
    daysElapsed: number;
    daysTotal: number;
    /** Projected end-of-month spend at current pace (current month only). */
    projectedSpent: number | null;
    projectedOverBudget: boolean | null;
    /** Previous calendar month total spend for comparison. */
    lastMonthSpent: number | null;
    /** Spend change vs last month, percent (-100..∞, null when no baseline). */
    deltaPct: number | null;
    topCategory: { category: ExpenseCategory; total: number; pctOfSpend: number } | null;
    net: number;
    savingRatePct: number | null;
    verdict: 'on_track' | 'watch' | 'over' | 'no_budget';
  };
  expenses: ExpenseDTO[];
  incomes: IncomeDTO[];
  upcomingRecurring: { id: string; amount: number; category: ExpenseCategory; description: string | null; recurrence: Recurrence | null; nextDueAt: string | null }[];
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

  /** Edit an existing expense (amount/category/description/date) — BRD §19 corrections. */
  async updateExpense(
    userId: string,
    id: string,
    input: {
      amount?: number;
      category?: string | null;
      description?: string | null;
      date?: string | null;
    }
  ): Promise<ExpenseDTO> {
    const data: {
      amount?: number;
      category?: ExpenseCategory;
      description?: string | null;
      date?: Date;
    } = {};
    if (input.amount !== undefined && input.amount !== null) {
      data.amount = this.validateAmount(input.amount);
    }
    if (input.category !== undefined && input.category !== null && String(input.category).trim() !== '') {
      const upper = String(input.category).toUpperCase();
      if (!(EXPENSE_CATEGORIES as readonly string[]).includes(upper)) {
        throw new ValidationError(`الفئة "${input.category}" مش معروفة`);
      }
      data.category = upper as ExpenseCategory;
    }
    if (input.description !== undefined) {
      data.description = input.description?.trim() || null;
    }
    if (input.date) {
      const parsed = this.parseDate(input.date);
      if (!parsed) throw new ValidationError('التاريخ ده مش صحيح');
      data.date = parsed;
    }
    if (Object.keys(data).length === 0) throw new ValidationError('مفيش حاجة تتعدل');
    const updated = await this.finance.updateExpense(userId, id, data);
    if (!updated) throw new ValidationError('المصروف ده مش موجود');
    return serializeExpense(updated);
  }

  /** Fuzzy-match an expense by description against recent history (AI flows). */
  async matchExpense(userId: string, needle: string): Promise<ExpenseRecord | null> {
    if (!needle) return null;
    const now = nowWall();
    const from = new Date(now.getTime() - 60 * 86_400_000);
    const expenses = await this.finance.listExpenses(userId, { from, to: now });
    const target = needle.trim().toLowerCase();
    if (!target) return null;
    // Most recent first — listExpenses already sorts desc by date.
    return (
      expenses.find((e) => (e.description ?? '').toLowerCase() === target) ??
      expenses.find((e) => (e.description ?? '').toLowerCase().includes(target)) ??
      expenses.find((e) => target.includes((e.description ?? '').toLowerCase()) && (e.description ?? '').length >= 3) ??
      null
    );
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

  /** Edit an existing income (amount/source/date) — parity with expense corrections. */
  async updateIncome(
    userId: string,
    id: string,
    input: {
      amount?: number;
      source?: string | null;
      description?: string | null;
      date?: string | null;
    }
  ): Promise<IncomeDTO> {
    const data: {
      amount?: number;
      source?: string | null;
      description?: string | null;
      date?: Date;
    } = {};
    if (input.amount !== undefined && input.amount !== null) {
      data.amount = this.validateAmount(input.amount);
    }
    if (input.source !== undefined) {
      data.source = input.source?.trim() || null;
    }
    if (input.description !== undefined) {
      data.description = input.description?.trim() || null;
    }
    if (input.date) {
      const parsed = this.parseDate(input.date);
      if (!parsed) throw new ValidationError('التاريخ ده مش صحيح');
      data.date = parsed;
    }
    if (Object.keys(data).length === 0) throw new ValidationError('مفيش حاجة تتعدل');
    const updated = await this.finance.updateIncome(userId, id, data);
    if (!updated) throw new ValidationError('الخريبة دي مش موجودة');
    return serializeIncome(updated);
  }

  /** Fuzzy-match an income by source/description against recent history (AI flows). */
  async matchIncome(userId: string, needle: string): Promise<IncomeRecord | null> {
    if (!needle) return null;
    const now = nowWall();
    const from = new Date(now.getTime() - 60 * 86_400_000);
    const incomes = await this.finance.listIncomes(userId, { from, to: now });
    const target = needle.trim().toLowerCase();
    if (!target) return null;
    // Most recent first — listIncomes already sorts desc by date.
    return (
      incomes.find((i) => (i.source ?? '').toLowerCase() === target) ??
      incomes.find((i) => (i.source ?? '').toLowerCase().includes(target)) ??
      incomes.find((i) => (i.description ?? '').toLowerCase().includes(target)) ??
      incomes.find((i) => target.includes((i.source ?? '').toLowerCase()) && (i.source ?? '').length >= 3) ??
      null
    );
  }

  async setBudget(userId: string, amount: number): Promise<void> {
    const validated = this.validateAmount(amount);
    const now = nowWall();
    await this.finance.setBudgetAmount(userId, now.getUTCMonth() + 1, now.getUTCFullYear(), validated);
    await this.users.setMonthlyBudget(userId, validated);
  }

  async setCategoryBudget(userId: string, category: string, amount: number, monthKey?: string): Promise<void> {
    const validated = this.validateAmount(amount);
    const cat = this.validateCategory(category);
    if (cat === 'OTHER' && category && !(EXPENSE_CATEGORIES as readonly string[]).includes(category.toUpperCase())) {
      throw new ValidationError('الفئة دي مش معروفة');
    }
    const range = this.monthRange(monthKey);
    const target = range.from ?? startOfMonth(nowWall());
    await this.finance.setCategoryBudget(
      userId,
      target.getUTCMonth() + 1,
      target.getUTCFullYear(),
      cat,
      validated
    );
  }

  async removeCategoryBudget(userId: string, category: string, monthKey?: string): Promise<void> {
    const cat = this.validateCategory(category);
    if (cat === 'OTHER' && category && !(EXPENSE_CATEGORIES as readonly string[]).includes(category.toUpperCase())) {
      throw new ValidationError('الفئة دي مش معروفة');
    }
    const range = this.monthRange(monthKey);
    const target = range.from ?? startOfMonth(nowWall());
    await this.finance.setCategoryBudget(userId, target.getUTCMonth() + 1, target.getUTCFullYear(), cat, null);
  }

  async summary(userId: string, monthKey?: string): Promise<FinanceSummaryDTO> {
    const now = nowWall();
    const range = this.monthRange(monthKey);
    const monthStart = range.from ?? startOfMonth(now);
    const monthEnd = range.to ?? endOfMonth(now);

    // Previous calendar month range (for the report's comparison baseline).
    const prevStart = new Date(Date.UTC(monthEnd.getUTCFullYear(), monthEnd.getUTCMonth() - 1, 1));
    const prevEnd = endOfMonth(prevStart);

    const [expenses, incomes, budget, user, categoryBudgets, prevExpenses] = await Promise.all([
      this.finance.listExpenses(userId, { from: monthStart, to: monthEnd }),
      this.finance.listIncomes(userId, { from: monthStart, to: monthEnd }),
      this.finance.getBudgetAmount(userId, monthEnd.getUTCMonth() + 1, monthEnd.getUTCFullYear()),
      this.users.findById(userId),
      this.finance.listCategoryBudgets(userId, monthEnd.getUTCMonth() + 1, monthEnd.getUTCFullYear()),
      this.finance.listExpenses(userId, { from: prevStart, to: prevEnd }),
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

    // Per-category limits vs actual spend (BRD finance — user-set budgets).
    const categoryLimits = categoryBudgets
      .map((cb) => {
        const spent = byCategoryMap.get(cb.category) ?? 0;
        const pct = cb.amount > 0 ? Math.min(200, Math.round((spent / cb.amount) * 100)) : 0;
        return { category: cb.category, limit: cb.amount, spent, pct, over: spent > cb.amount };
      })
      .sort((a, b) => b.pct - a.pct);

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

    // Recurring commitments regardless of browsed month (e.g. a bill
    // created last month with nextDueAt in this month) — BRD §20.
    const allRecurring = (await this.finance.listExpenses(userId, {})).filter(
      (e) => e.isRecurring && e.nextDueAt && e.nextDueAt > now
    );

    const upcomingRecurring = [...new Map(
      [...expenses, ...allRecurring]
        .filter((e) => e.isRecurring && e.nextDueAt && e.nextDueAt > now)
        .map((e) => [e.id, e] as const)
    ).values()]
      .sort((a, b) => (a.nextDueAt?.getTime() ?? 0) - (b.nextDueAt?.getTime() ?? 0))
      .slice(0, 8)
      .map((e) => ({
        id: e.id,
        amount: e.amount,
        category: e.category,
        description: e.description,
        recurrence: e.recurrence,
        nextDueAt: e.nextDueAt ? e.nextDueAt.toISOString() : null,
      }));

    // ---- Month recap report (BRD §19) ------------------------------------
    const lastMonthSpent = prevExpenses.reduce((sum, e) => sum + e.amount, 0);
    const deltaPct =
      lastMonthSpent > 0
        ? Math.round(((monthSpent - lastMonthSpent) / lastMonthSpent) * 100)
        : null;
    const topCat = byCategory[0] ?? null;
    const net = incomeThisMonth - monthSpent;
    const projectedSpent = isCurrentMonth ? Math.round(dailyAverage * daysInMonth) : null;
    const projectedOverBudget =
      projectedSpent !== null && budgetAmount !== null ? projectedSpent > budgetAmount : null;
    const verdict: FinanceSummaryDTO['report']['verdict'] =
      budgetAmount === null
        ? 'no_budget'
        : monthSpent > budgetAmount
          ? 'over'
          : projectedOverBudget
            ? 'watch'
            : 'on_track';

    return {
      month: `${monthEnd.getUTCFullYear()}-${String(monthEnd.getUTCMonth() + 1).padStart(2, '0')}`,
      budget: budgetAmount,
      monthSpent,
      remaining: budgetAmount !== null ? budgetAmount - monthSpent : null,
      spentToday,
      incomeThisMonth,
      byCategory,
      categoryLimits,
      expectedRecurringRestOfMonth,
      dailyAverage,
      report: {
        daysElapsed: isCurrentMonth ? now.getUTCDate() : daysInMonth,
        daysTotal: daysInMonth,
        projectedSpent,
        projectedOverBudget,
        lastMonthSpent: lastMonthSpent > 0 ? lastMonthSpent : null,
        deltaPct,
        topCategory: topCat
          ? {
              category: topCat.category,
              total: topCat.total,
              pctOfSpend: monthSpent > 0 ? Math.round((topCat.total / monthSpent) * 100) : 0,
            }
          : null,
        net,
        savingRatePct: incomeThisMonth > 0 ? Math.round((net / incomeThisMonth) * 100) : null,
        verdict,
      },
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
