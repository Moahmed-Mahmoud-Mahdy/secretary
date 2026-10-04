import { serializeNotification } from '../../domain/services/serialize';
import {
  calendarInsights,
  financeInsights,
  personalizationInsights,
  planningInsights,
  taskInsights,
} from '../../domain/services/insights';
import type { InsightDTO, NotificationDTO, OccurrenceDTO, TaskRecord, UserRecord } from '../../domain/types';
import {
  dayKeyOf,
  endOfDay,
  endOfMonth,
  nowWall,
  startOfDay,
  startOfMonth,
  addDays,
} from '../../domain/services/time';
import type {
  IEventRepository,
  IFinanceRepository,
  INotificationRepository,
  IPlanRepository,
  ITaskRepository,
  IUserRepository,
} from '../../domain/repositories';
import { eventOccurrenceOnDay } from '../../domain/services/recurrence';

// ============================================================
// Dashboard use case (BRD §25, §29) — context-aware home data:
// today schedule, task progress, finance summary, smart
// insights, and notification syncing.
// ============================================================

export interface DashboardDTO {
  user: { id: string; name: string; firstName: string; monthlyBudget: number | null };
  today: string;
  greeting: string;
  schedule: OccurrenceDTO[];
  nextEvent: OccurrenceDTO | null;
  tasks: {
    overdue: { id: string; title: string; priority: string }[];
    dueToday: { id: string; title: string; priority: string }[];
    completedToday: number;
    activeTotal: number;
  };
  finance: {
    spentToday: number;
    monthSpent: number;
    budget: number | null;
    remaining: number | null;
    avgDailySpend: number;
  };
  insights: InsightDTO[];
  notifications: NotificationDTO[];
  unreadCount: number;
  suggestion: string | null;
  plan: { plannedMinutes: number; freeMinutes: number } | null;
}

export class DashboardUseCases {
  constructor(
    private readonly users: IUserRepository,
    private readonly tasks: ITaskRepository,
    private readonly events: IEventRepository,
    private readonly finance: IFinanceRepository,
    private readonly plans: IPlanRepository,
    private readonly notifications: INotificationRepository
  ) {}

  async getDashboard(userId: string): Promise<DashboardDTO> {
    const user = await this.users.findById(userId);
    if (!user) throw new Error('User not found');

    const now = nowWall();
    const today = dayKeyOf(now);
    const dayStart = startOfDay(now);
    const dayEnd = endOfDay(now);

    const [taskRecords, eventRecords, expenses, incomes, budget, slots] = await Promise.all([
      this.tasks.listAll(userId),
      this.events.listAll(userId),
      this.finance.listExpenses(userId, { from: addDays(dayStart, -14), to: now }),
      this.finance.listIncomes(userId, { from: startOfMonth(now), to: endOfMonth(now) }),
      this.finance.getBudgetAmount(userId, now.getUTCMonth() + 1, now.getUTCFullYear()),
      this.plans.listSlotsForDay(userId, dayStart, dayEnd),
    ]);

    // ---------- schedule ----------
    const occurrences: OccurrenceDTO[] = [];
    const taskMap = new Map(taskRecords.map((t) => [t.id, t]));
    for (const event of eventRecords) {
      const occ = eventOccurrenceOnDay(event, dayStart);
      if (!occ) continue;
      occurrences.push({
        key: `event-${event.id}`,
        kind: 'EVENT',
        refId: event.id,
        eventId: event.id,
        title: event.title,
        startAt: occ.start.toISOString(),
        endAt: occ.end ? occ.end.toISOString() : null,
        eventType: event.eventType,
        isRecurring: occ.isVirtual,
      });
    }
    for (const slot of slots) {
      const task = taskMap.get(slot.taskId);
      occurrences.push({
        key: `slot-${slot.id}`,
        kind: 'PLANNED_TASK',
        refId: slot.id,
        taskId: slot.taskId,
        title: task?.title ?? 'مهمة',
        startAt: slot.startAt.toISOString(),
        endAt: slot.endAt.toISOString(),
        status: slot.status,
        priority: task?.priority ?? 'MEDIUM',
      });
    }
    occurrences.sort((a, b) => a.startAt.localeCompare(b.startAt));
    const nextEvent =
      occurrences.find((o) => o.kind === 'EVENT' && new Date(o.startAt).getTime() >= now.getTime()) ?? null;

    // ---------- tasks ----------
    const open = taskRecords.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS');
    const overdue = open.filter((t) => t.deadline && t.deadline < now);
    const dueToday = open.filter((t) => t.deadline && dayKeyOf(t.deadline) === today);
    const completedToday = taskRecords.filter(
      (t) => t.completedAt && dayKeyOf(t.completedAt) === today
    ).length;

    // ---------- finance ----------
    const monthExpenses = await this.finance.listExpenses(userId, { from: startOfMonth(now), to: endOfMonth(now) });
    const monthSpent = monthExpenses.reduce((s, e) => s + e.amount, 0);
    const spentToday = expenses
      .filter((e) => dayKeyOf(e.date) === today)
      .reduce((s, e) => s + e.amount, 0);
    const daysWithSpend = Math.max(1, Math.min(14, now.getUTCDate()));
    const avgDailySpend = expenses.reduce((s, e) => s + e.amount, 0) / daysWithSpend;
    const remaining = budget !== null ? budget - monthSpent : null;

    // ---------- insights ----------
    const expectedRecurring = monthExpenses
      .filter((e) => e.isRecurring && e.nextDueAt && e.nextDueAt > now && e.nextDueAt <= endOfMonth(now))
      .reduce((s, e) => s + e.amount, 0);

    const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const plannedMinutes = slots
      .filter((s) => s.status !== 'MISSED')
      .reduce((sum, s) => sum + Math.max(0, Math.round((s.endAt.getTime() - s.startAt.getTime()) / 60000)), 0);
    const remainingDayMinutes = Math.max(0, 23 * 60 - nowMinutes);
    const freeMinutes = Math.max(0, Math.min(remainingDayMinutes, 15 * 60 - plannedMinutes));

    const insights: InsightDTO[] = [
      ...financeInsights({
        monthlyBudget: budget ?? user.monthlyBudget,
        monthSpent,
        spentToday,
        avgDailySpend,
        expectedRecurringRestOfMonth: expectedRecurring,
        dayOfMonth: now.getUTCDate(),
        daysInMonth: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate(),
        incomeThisMonth: incomes.reduce((s, i) => s + i.amount, 0),
      }),
      ...taskInsights({
        overdue: overdue.map((t) => ({ id: t.id, title: t.title })),
        dueWithin24h: open
          .filter((t) => t.deadline && t.deadline > now && t.deadline.getTime() - now.getTime() < 24 * 3600_000)
          .map((t) => ({ id: t.id, title: t.title })),
        dueTodayCount: dueToday.length,
        completedToday,
        activeTotal: open.length,
      }),
      ...planningInsights({
        freeMinutesToday: freeMinutes,
        unplannedImportant: open
          .filter((t) => t.priority === 'HIGH' || t.priority === 'URGENT')
          .map((t) => ({ id: t.id, title: t.title })),
      }),
      ...calendarInsights({
        nextEvent: nextEvent
          ? { title: nextEvent.title, minutesUntil: Math.round((new Date(nextEvent.startAt).getTime() - now.getTime()) / 60000) }
          : null,
      }),
      ...personalizationInsights(buildPersonalizationSnapshot(taskRecords, now)),
    ];

    // ---------- notifications ----------
    const completedLast7 = taskRecords.filter(
      (t) => t.completedAt && now.getTime() - t.completedAt.getTime() <= 7 * 86_400_000
    ).length;
    const spentLast7 = expenses
      .filter((e) => now.getTime() - e.date.getTime() <= 7 * 86_400_000)
      .reduce((s, e) => s + e.amount, 0);
    await this.syncNotifications(user, taskRecords, budget, monthSpent, now, spentLast7, completedLast7);
    const [unread, unreadCount] = await Promise.all([
      this.notifications.listUnread(userId),
      this.notifications.unreadCount(userId),
    ]);

    const hour = now.getUTCHours();
    const greeting = hour < 12 ? 'صباح الخير' : hour < 17 ? 'نهارك سعيد' : 'مساء الخير';
    const firstName = user.name.split(' ')[0];

    return {
      user: { id: user.id, name: user.name, firstName, monthlyBudget: user.monthlyBudget },
      today,
      greeting,
      schedule: occurrences,
      nextEvent,
      tasks: {
        overdue: overdue.map((t) => ({ id: t.id, title: t.title, priority: t.priority })),
        dueToday: dueToday.map((t) => ({ id: t.id, title: t.title, priority: t.priority })),
        completedToday,
        activeTotal: open.length,
      },
      finance: { spentToday, monthSpent, budget: budget ?? user.monthlyBudget, remaining, avgDailySpend },
      insights,
      notifications: unread.slice(0, 10).map(serializeNotification),
      unreadCount,
      suggestion: insights.find((i) => i.kind === 'SUGGESTION')?.text ?? null,
      plan: { plannedMinutes, freeMinutes: Math.max(0, freeMinutes) },
    };
  }

  async listInsights(userId: string): Promise<InsightDTO[]> {
    const dashboard = await this.getDashboard(userId);
    return dashboard.insights;
  }

  /** Rule-based notification generation, deduped by refKey (BRD §28). */
  private async syncNotifications(
    user: UserRecord,
    tasks: TaskRecord[],
    budget: number | null,
    monthSpent: number,
    now: Date,
    spentLast7: number,
    completedLast7: number
  ): Promise<void> {
    const today = dayKeyOf(now);
    const items: { type: string; title: string; body: string; refKey: string }[] = [];

    // Weekly summary — Egyptian week starts Saturday (BRD §28).
    if (now.getUTCDay() === 6) {
      const dayOfYear = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86_400_000);
      const weekKey = `${now.getUTCFullYear()}-W${Math.floor(dayOfYear / 7)}`;
      items.push({
        type: 'WEEKLY_SUMMARY',
        title: 'ملخصك الأسبوعي 📊',
        body: `السبت الجديد! الأسبوع اللي فات: خلصت ${completedLast7} ${completedLast7 === 1 ? 'مهمة' : 'مهام'} وصرفت حوالي ${Math.round(spentLast7)} جنيه. يلا نبدأ أسبوع منظم — تحب نظّملك يومك؟`,
        refKey: `weekly-${weekKey}`,
      });
    }

    const open = tasks.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS');
    const overdue = open.filter((t) => t.deadline && t.deadline < now);
    if (overdue.length > 0) {
      items.push({
        type: 'OVERDUE_TASK',
        title: 'مهام متأخرة',
        body: `عندك ${overdue.length} ${overdue.length === 1 ? 'مهمة متأخرة' : 'مهام متأخرة'} — تحب أظبطلك خطة جديدة؟`,
        refKey: `overdue-${today}`,
      });
    }

    for (const task of open) {
      if (!task.deadline) continue;
      const hoursLeft = (task.deadline.getTime() - now.getTime()) / 3600_000;
      if (hoursLeft > 0 && hoursLeft <= 24) {
        items.push({
          type: 'DEADLINE_WARNING',
          title: 'مهمة قربت تسلم',
          body: `«${task.title}» آخر موعد ليها خلال ${Math.max(1, Math.round(hoursLeft))} ساعة.`,
          refKey: `deadline-${task.id}-${today}`,
        });
      }
    }

    if (budget && budget > 0 && monthSpent / budget >= 0.8) {
      items.push({
        type: 'BUDGET_ALERT',
        title: 'تنبيه ميزانية',
        body: `صرفت ${Math.round((monthSpent / budget) * 100)}% من ميزانية الشهر (${Math.round(monthSpent)} من ${Math.round(budget)} جنيه).`,
        refKey: `budget-${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`,
      });
    }

    if (items.length > 0) {
      await this.notifications.createManyDeduped(
        user.id,
        items.map((i) => ({
          type: i.type as never,
          title: i.title,
          body: i.body,
          refKey: i.refKey,
        }))
      );
    }
  }
}

/** Personalization snapshot from real completion history (BRD §17). */
function buildPersonalizationSnapshot(tasks: TaskRecord[], now: Date): {
  completedByHour: number[];
  completedLast7: number;
  completedLast14: number;
  chronicOverdue: { id: string; title: string; daysLate: number }[];
  durationSamples: { title: string; estimatedMinutes: number; actualMinutes: number }[];
} {
  const completedByHour = new Array<number>(24).fill(0);
  for (const task of tasks) {
    if (!task.completedAt) continue;
    if (now.getTime() - task.completedAt.getTime() > 30 * 86_400_000) continue;
    completedByHour[task.completedAt.getUTCHours()] += 1;
  }
  const completedLast7 = tasks.filter(
    (t) => t.completedAt && now.getTime() - t.completedAt.getTime() <= 7 * 86_400_000
  ).length;
  const completedLast14 = tasks.filter(
    (t) => t.completedAt && now.getTime() - t.completedAt.getTime() <= 14 * 86_400_000
  ).length;
  const chronicOverdue = tasks
    .filter(
      (t) =>
        (t.status === 'TODO' || t.status === 'IN_PROGRESS') &&
        t.deadline &&
        now.getTime() - t.deadline.getTime() > 2 * 86_400_000
    )
    .map((t) => ({
      id: t.id,
      title: t.title,
      daysLate: Math.max(1, Math.floor((now.getTime() - (t.deadline?.getTime() ?? now.getTime())) / 86_400_000)),
    }));
  const durationSamples = tasks
    .filter(
      (t) =>
        t.completedAt !== null &&
        t.parentId === null &&
        now.getTime() - t.completedAt.getTime() <= 30 * 86_400_000 &&
        (t.estimatedMinutes ?? 0) > 0 &&
        t.actualMinutes > 0
    )
    .map((t) => ({
      title: t.title,
      estimatedMinutes: t.estimatedMinutes as number,
      actualMinutes: t.actualMinutes,
    }));
  return { completedByHour, completedLast7, completedLast14, chronicOverdue, durationSamples };
}
