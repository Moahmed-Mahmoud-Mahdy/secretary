import { AiInterpretationError } from '../../domain/errors';
import { matchTaskTitle } from './task-use-cases';
import { relativeDayArabic, dayKeyOf, nowWall, parseWallIso, fmtHHMM, weekdayArabic } from '../../domain/services/time';
import { CATEGORY_LABELS_AR } from '../../domain/enums';
import type { TaskDTO } from '../../domain/types';
import type {
  AiUserContext,
  EventRecord,
  OccurrenceDTO,
  TaskRecord,
  UserRecord,
} from '../../domain/types';
import type { AiAction, IAiAssistantService } from '../ports';
import type {
  IEventRepository,
  IFinanceRepository,
  IPlanRepository,
  IProjectRepository,
  ITaskRepository,
  IUserRepository,
} from '../../domain/repositories';
import type { FinanceUseCases } from './finance-use-cases';
import type { PlanningUseCases } from './planning-use-cases';
import type { TaskUseCases } from './task-use-cases';
import type { EventUseCases } from './event-use-cases';
import type { ProjectUseCases } from './project-use-cases';

// ============================================================
// AI chat use case (BRD §5-§9, §42) — the orchestration heart:
//   User Input → Intent Detection → Command Generation →
//   Validation → Business Rules → Command Execution.
//
// The AI never touches the database: it only proposes actions;
// this use case validates and executes them through the other
// use cases (Smart Auto-Execute: creates run instantly,
// destructive/updates need user confirmation).
// ============================================================

export interface ExecutedActionDTO {
  type: 'TASK' | 'EVENT' | 'EXPENSE' | 'INCOME' | 'BUDGET' | 'PROJECT' | 'PLAN' | 'TASK_COMPLETED';
  action: 'CREATED' | 'COMPLETED' | 'EXECUTED';
  summary: string;
  refId?: string;
}

export interface PendingActionDTO {
  id: string;
  type: 'DELETE_TASK' | 'UPDATE_TASK' | 'DELETE_EVENT';
  title: string;
  summary: string;
  payload: Record<string, unknown>;
}

export interface QueryDataDTO {
  queryType: string;
  question: string;
  data: Record<string, unknown>;
}

export interface ChatResultDTO {
  reply: string;
  intent: string;
  executed: ExecutedActionDTO[];
  pending: PendingActionDTO[];
  query: QueryDataDTO | null;
  failed: string[];
}

const MAX_ACTIONS_PER_MESSAGE = 8;

/** Actions that always need explicit user confirmation (BRD §8). */
const CONFIRMATION_REQUIRED = new Set(['DELETE_TASK', 'UPDATE_TASK', 'DELETE_EVENT']);

export class AiChatUseCases {
  private pendingCounter = 0;

  constructor(
    private readonly users: IUserRepository,
    private readonly tasks: ITaskRepository,
    private readonly projects: IProjectRepository,
    private readonly events: IEventRepository,
    private readonly finance: IFinanceRepository,
    private readonly plans: IPlanRepository,
    private readonly ai: IAiAssistantService,
    private readonly taskUseCases: TaskUseCases,
    private readonly financeUseCases: FinanceUseCases,
    private readonly planningUseCases: PlanningUseCases,
    private readonly eventUseCases: EventUseCases,
    private readonly projectUseCases: ProjectUseCases
  ) {}

  async handleMessage(userId: string, message: string): Promise<ChatResultDTO> {
    const text = message.trim();
    if (!text) throw new AiInterpretationError('اكتب حاجة الأول 😄');

    const context = await this.buildContext(userId);
    const interpretation = await this.ai.interpret({ message: text, context });
    if (process.env.NODE_ENV !== 'production') {
      console.log('[ai-chat] interpretation:', JSON.stringify(interpretation).slice(0, 500));
    }

    const executed: ExecutedActionDTO[] = [];
    const pending: PendingActionDTO[] = [];
    const failed: string[] = [];
    let query: QueryDataDTO | null = null;
    let chitchat = interpretation.intent === 'CHITCHAT';

    const actions = (interpretation.actions ?? []).slice(0, MAX_ACTIONS_PER_MESSAGE);
    // Safety net: when the model returns an intent without actions,
    // synthesize the command from the intent itself.
    const effectiveActions: AiAction[] =
      actions.length > 0 ? actions : (synthesizeActionFromIntent(interpretation.intent, text) ?? []);
    for (const action of effectiveActions) {
      try {
        await this.processAction(userId, action, executed, pending, (q) => {
          query = q;
        });
      } catch (error) {
        failed.push(actionLabel(action));
        if (process.env.NODE_ENV !== 'production') {
          console.error('[ai-chat] action failed:', action.type, error);
        }
      }
      if ((action.type ?? '').toUpperCase() === 'CHITCHAT') chitchat = true;
    }

    let reply: string;
    const queryValue = query as QueryDataDTO | null;
    if (queryValue && queryValue.question) {
      reply = await this.safeAnswerQuestion(queryValue, context.firstName);
    } else if (executed.length > 0 || pending.length > 0 || failed.length > 0) {
      reply = this.buildReply(context.firstName, executed, pending, failed);
    } else if (chitchat) {
      reply = await this.safeSmallTalk(text, context.firstName);
    } else {
      reply = `مش متأكد إني فهمت قصدك يا ${context.firstName} — ممكن تقولها لي بطريقة تانية؟`;
    }

    return { reply, intent: interpretation.intent ?? 'UNKNOWN', executed, pending, query: queryValue, failed };
  }

  /** Executes a previously-confirmed action (BRD §8 confirmation flow). */
  async executeConfirmedAction(userId: string, pending: PendingActionDTO): Promise<ExecutedActionDTO> {
    const executed: ExecutedActionDTO[] = [];
    switch (pending.type) {
      case 'DELETE_TASK': {
        const taskId = String(payloadValue(pending.payload, 'taskId'));
        const task = await this.tasks.findById(userId, taskId);
        await this.taskUseCases.delete(userId, taskId);
        return { type: 'TASK', action: 'EXECUTED', summary: `تمسحت مهمة «${task?.title ?? 'المهمة'}»`, refId: taskId };
      }
      case 'DELETE_EVENT': {
        const eventId = String(payloadValue(pending.payload, 'eventId'));
        const event = await this.events.findById(userId, eventId);
        await this.events.delete(userId, eventId);
        return { type: 'EVENT', action: 'EXECUTED', summary: `تمسح حدث «${event?.title ?? 'الحدث'}»`, refId: eventId };
      }
      case 'UPDATE_TASK': {
        const taskId = String(payloadValue(pending.payload, 'taskId'));
        const fields = (payloadValue(pending.payload, 'fields') ?? {}) as Record<string, unknown>;
        const updated = await this.taskUseCases.update(userId, taskId, fields as never);
        return { type: 'TASK', action: 'EXECUTED', summary: `عدّلت مهمة «${updated.title}»`, refId: taskId };
      }
      default:
        throw new AiInterpretationError('نوع الطلب ده مش محتاج تأكيد');
    }
  }

  // ---------------- internals ----------------

  private async processAction(
    userId: string,
    action: AiAction,
    executed: ExecutedActionDTO[],
    pending: PendingActionDTO[],
    setQuery: (q: QueryDataDTO) => void
  ): Promise<void> {
    const type = String(action.type ?? '').toUpperCase();

    switch (type) {
      case 'CREATE_TASK': {
        const created = await this.taskUseCases.create(userId, {
          title: str(action.title) ?? 'مهمة جديدة',
          description: str(action.description),
          priority: str(action.priority) ?? undefined,
          estimatedMinutes: num(action.estimatedMinutes),
          deadline: str(action.deadline),
          projectId: await this.resolveProjectId(userId, str(action.projectName)),
        });
        executed.push({ type: 'TASK', action: 'CREATED', summary: this.taskSummary(created), refId: created.id });
        return;
      }
      case 'CREATE_EVENT': {
        const startAt = str(action.startAt);
        if (!startAt) throw new Error('event without startAt');
        const created = await this.eventUseCases.create(userId, {
          title: str(action.title) ?? 'حدث',
          startAt,
          endAt: str(action.endAt) ?? null,
          recurrence: str(action.recurrence),
        });
        executed.push({ type: 'EVENT', action: 'CREATED', summary: this.eventSummary(created.title, created.startAt), refId: created.id });
        return;
      }
      case 'CREATE_EXPENSE': {
        const amount = num(action.amount);
        if (!amount) throw new Error('expense without amount');
        const created = await this.financeUseCases.createExpense(userId, {
          amount,
          category: str(action.category) ?? undefined,
          description: str(action.description),
          date: str(action.date),
        });
        const categoryLabel = CATEGORY_LABELS_AR[created.category] ?? '';
        const summary = `سجلت ${formatAmount(created.amount)} جنيه على ${created.description || categoryLabel}`;
        executed.push({ type: 'EXPENSE', action: 'CREATED', summary, refId: created.id });
        return;
      }
      case 'UPDATE_EXPENSE': {
        const name = str(action.expenseName) ?? str(action.description) ?? '';
        const target = await this.financeUseCases.matchExpense(userId, name);
        if (!target) {
          executed.push({ type: 'EXPENSE', action: 'EXECUTED', summary: `ملقيتش مصروف باسم «${name || '؟'}» في آخر شهرين` });
          return;
        }
        const newAmount = num(action.amount);
        const newCategory = str(action.category);
        if (newAmount === undefined && !newCategory) {
          executed.push({ type: 'EXPENSE', action: 'EXECUTED', summary: `قولي أعدّل إيه في «${target.description ?? name}» — المبلغ ولا الفئة؟` });
          return;
        }
        const updated = await this.financeUseCases.updateExpense(userId, target.id, {
          amount: newAmount,
          category: newCategory,
        });
        const changes: string[] = [];
        if (newAmount !== undefined) changes.push(`بقى ${formatAmount(updated.amount)} جنيه`);
        if (newCategory) changes.push(`اتنقل على ${CATEGORY_LABELS_AR[updated.category] ?? newCategory}`);
        const descText = target.description || CATEGORY_LABELS_AR[updated.category] || 'المصروف';
        executed.push({
          type: 'EXPENSE',
          action: 'EXECUTED',
          summary: `عدّلت «${descText}» — ${changes.join(' و')}`,
          refId: updated.id,
        });
        return;
      }
      case 'CREATE_INCOME': {
        const amount = num(action.amount);
        if (!amount) throw new Error('income without amount');
        const created = await this.financeUseCases.createIncome(userId, {
          amount,
          source: str(action.source),
          date: str(action.date),
        });
        executed.push({ type: 'INCOME', action: 'CREATED', summary: `سجلت دخل ${formatAmount(created.amount)} جنيه`, refId: created.id });
        return;
      }
      case 'UPDATE_INCOME': {
        const name = str(action.incomeName) ?? str(action.source) ?? '';
        const target = await this.financeUseCases.matchIncome(userId, name);
        if (!target) {
          executed.push({ type: 'INCOME', action: 'EXECUTED', summary: `ملقيتش دخل باسم «${name || '؟'}» في آخر شهرين` });
          return;
        }
        const newAmount = num(action.amount);
        if (newAmount === undefined) {
          executed.push({ type: 'INCOME', action: 'EXECUTED', summary: `قولي المبلغ الجديد لـ «${target.source ?? name}» كام؟` });
          return;
        }
        const updated = await this.financeUseCases.updateIncome(userId, target.id, { amount: newAmount });
        executed.push({
          type: 'INCOME',
          action: 'EXECUTED',
          summary: `عدّلت دخل «${target.source ?? 'الخريبة'}» — بقى ${formatAmount(updated.amount)} جنيه`,
          refId: updated.id,
        });
        return;
      }
      case 'SET_BUDGET': {
        const amount = num(action.amount);
        if (!amount) throw new Error('budget without amount');
        await this.financeUseCases.setBudget(userId, amount);
        executed.push({ type: 'BUDGET', action: 'CREATED', summary: `ظبطت ميزانية الشهر على ${formatAmount(amount)} جنيه` });
        return;
      }
      case 'TRANSFER_BUDGET': {
        const fromCategory = str(action.fromCategory) ?? str(action.from);
        const toCategory = str(action.toCategory) ?? str(action.to);
        const amount = num(action.amount);
        if (!fromCategory || !toCategory || !amount) throw new Error('transfer without full data');
        const res = await this.financeUseCases.transferCategoryBudget(userId, fromCategory, toCategory, amount);
        const fromLabel = CATEGORY_LABELS_AR[res.from] ?? fromCategory;
        const toLabel = CATEGORY_LABELS_AR[res.to] ?? toCategory;
        executed.push({
          type: 'BUDGET',
          action: 'EXECUTED',
          summary: `حوّلت ${formatAmount(amount)} ج من حد ${fromLabel} لحد ${toLabel} — بقى ${fromLabel} ${formatAmount(res.fromLimit)} ج و${toLabel} ${formatAmount(res.toLimit)} ج`,
        });
        return;
      }
      case 'POSTPONE': {
        const all = await this.tasks.listAll(userId);
        const task = matchTaskTitle(all, str(action.taskName) ?? str(action.title) ?? '');
        if (!task) {
          executed.push({
            type: 'TASK',
            action: 'EXECUTED',
            summary: `ملقيتش مهمة مفتوحة باسم «${str(action.taskName) ?? '؟'}» عشان أأجّلها`,
          });
          return;
        }
        const toDate = str(action.toDate) ?? str(action.date);
        if (!toDate || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) throw new Error('postpone without valid toDate');
        const toTime = str(action.toTime);
        const timeMatch = toTime?.match(/^(\d{1,2}):(\d{2})/);
        const hh = timeMatch ? String(Math.min(23, Number(timeMatch[1]))).padStart(2, '0') : null;
        const mm = timeMatch ? timeMatch[2] : null;
        const deadlineIso = hh && mm ? `${toDate}T${hh}:${mm}:00` : `${toDate}T23:59:59`;
        const updated = await this.taskUseCases.update(userId, task.id, { deadline: deadlineIso });
        const newDeadline = parseWallIso(deadlineIso);
        // Unschedule ALL of the task's open (PLANNED) slots — including stale
        // ones earlier today: the plan must reflect the postponement (BRD §13).
        const removed = await this.plans.deleteFutureSlotsForTask(userId, task.id, new Date(0));
        let summary = `أجّلت «${updated.title}» لـ ${relativeDayArabic(newDeadline, nowWall())}`;
        if (hh && mm) summary += ` الساعة ${fmtHHMM(newDeadline)}`;
        if (removed > 0) {
          summary += ` — وشلت ${removed === 1 ? 'موضعها القديم' : `${removed} مواضع قديمة ليها`} من الخطة. لو عايزني أحطها في يوم جديد قول «نظملي يومي»`;
        }
        executed.push({ type: 'TASK', action: 'EXECUTED', summary, refId: task.id });
        return;
      }
      case 'SET_CATEGORY_BUDGET': {
        const amount = num(action.amount);
        const category = str(action.category) ?? 'OTHER';
        if (!amount) throw new Error('category budget without amount');
        await this.financeUseCases.setCategoryBudget(userId, category, amount);
        const label = CATEGORY_LABELS_AR[category.toUpperCase() as keyof typeof CATEGORY_LABELS_AR] ?? category;
        executed.push({
          type: 'BUDGET',
          action: 'CREATED',
          summary: `ظبطت حد صرف ${label} على ${formatAmount(amount)} جنيه في الشهر`,
        });
        return;
      }
      case 'CREATE_PROJECT': {
        const name = str(action.name) ?? str(action.title);
        if (!name) throw new Error('project without name');
        const created = await this.projectUseCases.create(userId, { name, deadline: str(action.deadline) });
        executed.push({ type: 'PROJECT', action: 'CREATED', summary: `عملتلك مشروع «${created.name}»`, refId: created.id });
        return;
      }
      case 'CREATE_PROJECT_WITH_TASKS': {
        const name = str(action.name) ?? str(action.title);
        if (!name) throw new Error('project breakdown without name');
        const created = await this.projectUseCases.create(userId, {
          name,
          description: str(action.description),
          deadline: str(action.deadline),
        });
        const rawTasks = Array.isArray(action.tasks) ? action.tasks.slice(0, 8) : [];
        const titles: string[] = [];
        for (const raw of rawTasks) {
          const t = (raw ?? {}) as Record<string, unknown>;
          const title = str(t.title);
          if (!title) continue;
          await this.taskUseCases.create(userId, {
            title,
            priority: str(t.priority) ?? 'MEDIUM',
            estimatedMinutes: num(t.estimatedMinutes),
            projectId: created.id,
          });
          titles.push(title);
        }
        executed.push({
          type: 'PROJECT',
          action: 'CREATED',
          summary:
            titles.length > 0
              ? `عملتلك مشروع «${created.name}» فيه ${titles.length} مهام: ${titles.join('، ')}`
              : `عملتلك مشروع «${created.name}»`,
          refId: created.id,
        });
        return;
      }
      case 'ADD_SUBTASKS': {
        const parentName = str(action.taskName) ?? str(action.title) ?? '';
        const all = await this.tasks.listAll(userId);
        const parent = matchTaskTitle(all, parentName);
        if (!parent) {
          executed.push({ type: 'TASK', action: 'EXECUTED', summary: `ملقيتش مهمة باسم «${parentName || '؟'}» أضيفلها خطوات` });
          return;
        }
        const rawSubtasks = Array.isArray(action.subtasks) ? action.subtasks.slice(0, 10) : [];
        let added = 0;
        for (const raw of rawSubtasks) {
          const title = typeof raw === 'string' ? raw.trim() : str((raw as Record<string, unknown>)?.title);
          if (!title) continue;
          await this.taskUseCases.create(userId, { title, parentId: parent.id, projectId: parent.projectId });
          added += 1;
        }
        executed.push({
          type: 'TASK',
          action: 'CREATED',
          summary:
            added > 0
              ? `ضفت ${added} ${added === 1 ? 'خطوة' : 'خطوات'} تحت «${parent.title}»`
              : `مفيش خطوات أقدر أضيفها تحت «${parent.title}»`,
          refId: parent.id,
        });
        return;
      }
      case 'COMPLETE_TASK': {
        const all = await this.tasks.listAll(userId);
        const task = matchTaskTitle(all, str(action.taskName) ?? str(action.title) ?? '');
        if (!task) {
          executed.push({ type: 'TASK', action: 'EXECUTED', summary: `ملقيتش مهمة باسم «${str(action.taskName) ?? '؟'}» عشان أقفلها` });
          return;
        }
        await this.taskUseCases.update(userId, task.id, { status: 'COMPLETED' });
        executed.push({ type: 'TASK_COMPLETED', action: 'COMPLETED', summary: `برافو! قفلت مهمة «${task.title}» ✅`, refId: task.id });
        return;
      }
      case 'DELETE_TASK': {
        const all = await this.tasks.listAll(userId);
        const task = matchTaskTitle(all, str(action.taskName) ?? '');
        if (!task) {
          executed.push({ type: 'TASK', action: 'EXECUTED', summary: `ملقيتش مهمة باسم «${str(action.taskName) ?? '؟'}»` });
          return;
        }
        this.pendingCounter += 1;
        pending.push({
          id: `p${this.pendingCounter}_${Date.now()}`,
          type: 'DELETE_TASK',
          title: task.title,
          summary: `مسح مهمة «${task.title}»`,
          payload: { taskId: task.id },
        });
        return;
      }
      case 'UPDATE_TASK': {
        const all = await this.tasks.listAll(userId);
        const task = matchTaskTitle(all, str(action.taskName) ?? '');
        if (!task) {
          executed.push({ type: 'TASK', action: 'EXECUTED', summary: `ملقيتش مهمة باسم «${str(action.taskName) ?? '؟'}»` });
          return;
        }
        const fields = sanitizeTaskFields(action.fields);
        this.pendingCounter += 1;
        pending.push({
          id: `p${this.pendingCounter}_${Date.now()}`,
          type: 'UPDATE_TASK',
          title: task.title,
          summary: `تعديل مهمة «${task.title}»: ${describeFields(fields)}`,
          payload: { taskId: task.id, fields },
        });
        return;
      }
      case 'DELETE_EVENT': {
        const eventName = str(action.eventName) ?? '';
        const event = await this.matchEvent(userId, eventName);
        if (!event) {
          executed.push({ type: 'EVENT', action: 'EXECUTED', summary: `ملقيتش حدث باسم «${eventName || '؟'}»` });
          return;
        }
        this.pendingCounter += 1;
        pending.push({
          id: `p${this.pendingCounter}_${Date.now()}`,
          type: 'DELETE_EVENT',
          title: event.title,
          summary: `مسح حدث «${event.title}»`,
          payload: { eventId: event.id },
        });
        return;
      }
      case 'PLAN_DAY': {
        const dateStr = str(action.date);
        const plan = await this.planningUseCases.generatePlan(userId, dateStr ?? undefined);
        executed.push({
          type: 'PLAN',
          action: 'EXECUTED',
          summary: `ظبطتلك خطة ${dateStr ? relativeDayArabic(parseWallIso(dateStr), nowWall()) : 'النهارده'} — ${plan.slots.length} ${plan.slots.length === 1 ? 'مهمة مجدولة' : 'مهام مجدولة'}`,
        });
        setQuery({
          queryType: 'PLAN_RESULT',
          question: 'عرض الخطة',
          data: { date: plan.date, slots: plan.slots, unplanned: plan.unplanned },
        });
        return;
      }
      case 'QUERY': {
        const queryType = (str(action.queryType) ?? 'GENERAL').toUpperCase();
        const question = str(action.question) ?? str(action.raw) ?? 'سؤال المستخدم';
        const data = await this.fetchQueryData(userId, queryType);
        setQuery({ queryType, question, data });
        return;
      }
      case 'CHITCHAT':
        return; // handled after the loop
      default:
        throw new Error(`unknown action type: ${type}`);
    }
  }

  private async fetchQueryData(userId: string, queryType: string): Promise<Record<string, unknown>> {
    const now = nowWall();
    switch (queryType) {
      case 'FINANCE_SUMMARY': {
        const s = await this.financeUseCases.summary(userId);
        return {
          monthSpent: s.monthSpent,
          budget: s.budget,
          remaining: s.remaining,
          spentToday: s.spentToday,
          incomeThisMonth: s.incomeThisMonth,
          dailyAverage: Math.round(s.dailyAverage),
          byCategory: s.byCategory.slice(0, 5),
          categoryLimits: s.categoryLimits,
          report: s.report,
        };
      }
      case 'BUDGET_STATUS': {
        const s = await this.financeUseCases.summary(userId);
        return {
          budget: s.budget,
          monthSpent: s.monthSpent,
          remaining: s.remaining,
          expectedRecurringRestOfMonth: s.expectedRecurringRestOfMonth,
          dailyAverage: Math.round(s.dailyAverage),
          categoryLimits: s.categoryLimits,
          report: s.report,
        };
      }
      case 'MONTH_REPORT': {
        const s = await this.financeUseCases.summary(userId);
        const prev = s.report.lastMonthSpent;
        return {
          month: s.month,
          budget: s.budget,
          monthSpent: s.monthSpent,
          remaining: s.remaining,
          incomeThisMonth: s.incomeThisMonth,
          dailyAverage: Math.round(s.dailyAverage),
          report: s.report,
          byCategory: s.byCategory.slice(0, 5),
          lastMonthSpent: prev,
        };
      }
      case 'PRODUCTIVITY': {
        const all = await this.tasks.listAll(userId);
        const completed = all.filter(
          (t) => t.completedAt && now.getTime() - t.completedAt.getTime() <= 30 * 86_400_000
        );
        const byHour = new Array<number>(24).fill(0);
        for (const t of completed) byHour[t.completedAt!.getUTCHours()] += 1;
        const maxHour = Math.max(...byHour);
        const peakHours =
          maxHour > 0
            ? byHour
                .map((c, h) => ({ c, h }))
                .filter((x) => x.c >= Math.max(1, Math.round(maxHour * 0.6)))
                .map((x) => x.h)
            : [];
        const last7 = completed.filter(
          (t) => now.getTime() - t.completedAt!.getTime() <= 7 * 86_400_000
        ).length;
        const last14 = completed.filter(
          (t) => now.getTime() - t.completedAt!.getTime() <= 14 * 86_400_000
        ).length;
        const samples = completed.filter(
          (t) => (t.estimatedMinutes ?? 0) > 0 && t.actualMinutes > 0
        );
        const avgEst = samples.length
          ? Math.round(samples.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0) / samples.length)
          : null;
        const avgAct = samples.length
          ? Math.round(samples.reduce((s, t) => s + t.actualMinutes, 0) / samples.length)
          : null;
        const driftPct =
          avgEst && avgEst > 0 && avgAct !== null
            ? Math.round(((avgAct - avgEst) / avgEst) * 100)
            : null;
        return {
          completionsLast7Days: last7,
          completionsLast14Days: last14,
          avgCompletionsPerDay: Math.round((last14 / 14) * 10) / 10,
          peakCompletionHours: peakHours,
          durationSamplesCount: samples.length,
          avgEstimatedMinutes: avgEst,
          avgActualMinutes: avgAct,
          driftPct,
          chronicOverdueTitles: all
            .filter(
              (t) =>
                (t.status === 'TODO' || t.status === 'IN_PROGRESS') &&
                t.deadline &&
                now.getTime() - t.deadline.getTime() > 2 * 86_400_000
            )
            .slice(0, 5)
            .map((t) => t.title),
        };
      }
      case 'TODAY_SCHEDULE': {
        const day = dayKeyOf(now);
        const occurrences = await this.dayOccurrences(userId, day);
        return { day, items: occurrences.map((o) => ({ time: fmtHHMM(new Date(o.startAt)), title: o.title, kind: o.kind, status: o.status ?? null })) };
      }
      case 'TASKS_STATUS': {
        const all = await this.tasks.listAll(userId);
        const open = all.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS');
        const overdue = open.filter((t) => t.deadline && t.deadline < now);
        const completedToday = all.filter((t) => t.completedAt && dayKeyOf(t.completedAt) === dayKeyOf(now)).length;
        return {
          activeTotal: open.length,
          overdueCount: overdue.length,
          overdueTitles: overdue.slice(0, 5).map((t) => t.title),
          completedToday,
          nextDeadlines: open
            .filter((t) => t.deadline)
            .sort((a, b) => (a.deadline?.getTime() ?? 0) - (b.deadline?.getTime() ?? 0))
            .slice(0, 5)
            .map((t) => ({ title: t.title, deadline: t.deadline ? dayKeyOf(t.deadline) : null })),
        };
      }
      case 'HABITS': {
        const [habits, fin] = await Promise.all([
          this.taskUseCases.listHabits(userId),
          this.financeUseCases.summary(userId),
        ]);
        return {
          habits: habits.map((h) => ({
            title: h.title,
            recurrence: h.recurrence,
            streak: h.streak,
            bestStreak: h.bestStreak,
            totalCompletions: h.totalCompletions,
            isDueToday: h.isDueToday,
            nextDue: h.deadline ? dayKeyOf(parseWallIso(h.deadline.slice(0, 10))) : null,
          })),
          recurringBills: (fin.upcomingRecurring ?? []).map((b) => ({
            name: b.description,
            amount: b.amount,
            nextDue: b.nextDueAt ? dayKeyOf(parseWallIso(b.nextDueAt.slice(0, 10))) : null,
          })),
        };
      }
      default: {
        const [summary, dayOccurrences, habits] = await Promise.all([
          this.financeUseCases.summary(userId),
          this.dayOccurrences(userId, dayKeyOf(now)),
          this.taskUseCases.listHabits(userId),
        ]);
        const allTasks = await this.tasks.listAll(userId);
        const open = allTasks.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS');
        return {
          today: dayKeyOf(now),
          scheduleToday: dayOccurrences.slice(0, 8).map((o) => ({ time: fmtHHMM(new Date(o.startAt)), title: o.title })),
          activeTasks: open.length,
          overdueTasks: open.filter((t) => t.deadline && t.deadline < now).length,
          monthSpent: summary.monthSpent,
          budget: summary.budget,
          remaining: summary.remaining,
          spentToday: summary.spentToday,
          habits: habits.map((h) => ({
            title: h.title,
            recurrence: h.recurrence,
            streak: h.streak,
            bestStreak: h.bestStreak,
            totalCompletions: h.totalCompletions,
            isDueToday: h.isDueToday,
          })),
          recurringBills: (summary.upcomingRecurring ?? []).map((b) => ({
            name: b.description,
            amount: b.amount,
            nextDue: b.nextDueAt ? b.nextDueAt.slice(0, 10) : null,
          })),
        };
      }
    }
  }

  private async dayOccurrences(userId: string, day: string): Promise<OccurrenceDTO[]> {
    const [events, slots, tasks] = await Promise.all([
      this.events.listAll(userId),
      this.plans.listSlotsForDay(userId, parseWallIso(day), new Date(parseWallIso(day).getTime() + 86_400_000)),
      this.tasks.listAll(userId),
    ]);
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const out: OccurrenceDTO[] = [];
    for (const e of events) {
      if (dayKeyOf(e.startAt) !== day && !e.recurrence) continue;
      out.push({ key: `e-${e.id}`, kind: 'EVENT', refId: e.id, title: e.title, startAt: e.startAt.toISOString(), endAt: e.endAt?.toISOString() ?? null, isRecurring: Boolean(e.recurrence) });
    }
    for (const s of slots) {
      const t = taskMap.get(s.taskId);
      out.push({ key: `s-${s.id}`, kind: 'PLANNED_TASK', refId: s.id, taskId: s.taskId, title: t?.title ?? 'مهمة', startAt: s.startAt.toISOString(), endAt: s.endAt.toISOString(), status: s.status });
    }
    return out.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  private async buildContext(userId: string): Promise<AiUserContext> {
    const [user, projects, tasks] = await Promise.all([
      this.users.findById(userId),
      this.projects.listAll(userId),
      this.tasks.listAll(userId),
    ]);
    const now = nowWall();
    const open = tasks.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS');
    return {
      userName: user?.name ?? 'صاحبي',
      firstName: (user?.name ?? 'صاحبي').split(' ')[0],
      nowIso: now.toISOString().slice(0, 16),
      weekdayName: weekdayArabic(now),
      dayKey: dayKeyOf(now),
      projects: projects.slice(0, 15).map((p) => p.name),
      openTasks: open.slice(0, 25).map((t) => ({ id: t.id, title: t.title })),
    };
  }

  private async resolveProjectId(userId: string, projectName?: string | null): Promise<string | null> {
    if (!projectName) return null;
    const projects = await this.projects.listAll(userId);
    const target = projectName.trim().toLowerCase();
    const found = projects.find((p) => p.name.toLowerCase() === target || p.name.toLowerCase().includes(target));
    return found?.id ?? null;
  }

  private async matchEvent(userId: string, needle: string): Promise<EventRecord | null> {
    if (!needle) return null;
    const events = await this.events.listAll(userId);
    const target = needle.trim().toLowerCase();
    return (
      events.find((e) => e.title.toLowerCase() === target) ??
      events.find((e) => e.title.toLowerCase().includes(target)) ??
      null
    );
  }

  private taskSummary(task: TaskDTO): string {
    const now = nowWall();
    let text = `عملتلك مهمة «${task.title}»`;
    if (task.deadline) {
      const deadline = parseWallIso(task.deadline);
      text += ` — آخر موعد ${relativeDayArabic(deadline, now)}`;
      const isMidnight = deadline.getUTCHours() === 23 && deadline.getUTCMinutes() === 59;
      if (!isMidnight) text += ` الساعة ${fmtHHMM(deadline)}`;
    }
    if (task.estimatedMinutes) text += ` (تقريبًا ${task.estimatedMinutes} دقيقة)`;
    return text;
  }

  private eventSummary(title: string, startAtIso: string): string {
    const start = parseWallIso(startAtIso);
    return `ضفت «${title}» ${relativeDayArabic(start, nowWall())} الساعة ${fmtHHMM(start)}`;
  }

  private buildReply(
    firstName: string,
    executed: ExecutedActionDTO[],
    pending: PendingActionDTO[],
    failed: string[]
  ): string {
    const openers = ['تمام', 'ماشي', 'تحت أمرك', 'تم'];
    const opener = openers[Math.floor(Math.random() * openers.length)];
    const parts: string[] = [];

    if (executed.length > 0) {
      parts.push(`${opener} يا ${firstName}: ${executed.map((e) => e.summary).join('، وكمان ')}.`);
    }
    if (pending.length > 0) {
      parts.push(`الطلبية دي محتاجة تأكيد منك: ${pending.map((p) => p.summary).join('، ')}. لو موافق دوس «تأكيد» 👌`);
    }
    if (failed.length > 0) {
      parts.push(`معلش، معرفتش أنفذ (${failed.join('، ')}) — جرب تاني.`);
    }
    return parts.join(' ');
  }

  private async safeAnswerQuestion(query: QueryDataDTO, firstName: string): Promise<string> {
    try {
      return await this.ai.answerQuestion({
        question: query.question,
        dataJson: JSON.stringify(query.data),
        userName: firstName,
      });
    } catch {
      return this.fallbackDataReply(query);
    }
  }

  private fallbackDataReply(query: QueryDataDTO): string {
    const lines: string[] = [];
    const d = query.data as Record<string, unknown>;
    if (d.monthSpent !== undefined) lines.push(`صرفت الشهر ده حوالي ${Math.round(Number(d.monthSpent))} جنيه`);
    if (d.remaining !== undefined && d.remaining !== null) lines.push(`والباقي من الميزانية ${Math.round(Number(d.remaining))} جنيه`);
    if (d.spentToday !== undefined) lines.push(`النهارده صرفت ${Math.round(Number(d.spentToday))} جنيه`);
    if (d.activeTotal !== undefined) lines.push(`عندك ${d.activeTotal} مهام شغالة`);
    const rawItems = d.items as unknown;
    if (Array.isArray(rawItems) && rawItems.length > 0) {
      const items = rawItems as { time?: string; title: string }[];
      lines.push(`جدولك: ${items.map((i) => `${i.time ? i.time + ' ' : ''}${i.title}`).join('، ')}`);
    }
    return lines.length > 0 ? lines.join('، ') + '.' : 'مفيش بيانات كفاية أجاوب منها لسه.';
  }

  private async safeSmallTalk(message: string, firstName: string): Promise<string> {
    try {
      return await this.ai.smallTalk({ message, userName: firstName });
    } catch {
      return `أنا معاك يا ${firstName} — قولّي عايز إني أعمل إيه؟`;
    }
  }
}

// ---------------- helpers ----------------

/**
 * Intent → command fallback for intent-only responses (Command
 * Generation safety net — keeps the pipeline resilient).
 */
function synthesizeActionFromIntent(intent: string, message: string): AiAction[] | null {
  const normalized = String(intent ?? '').toUpperCase();
  switch (normalized) {
    case 'QUERY':
      return [{ type: 'QUERY', queryType: 'GENERAL', question: message }];
    case 'CHITCHAT':
      return [{ type: 'CHITCHAT', message }];
    case 'PLAN_DAY':
      return [{ type: 'PLAN_DAY', date: null }];
    default:
      return null;
  }
}

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  return s.length > 0 ? s : undefined;
}

function num(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function payloadValue(payload: Record<string, unknown>, key: string): unknown {
  return payload?.[key];
}

function actionLabel(action: AiAction): string {
  const t = String(action.type ?? 'action').toUpperCase();
  const title = str(action.title) ?? str(action.taskName) ?? str(action.eventName) ?? str(action.name) ?? '';
  return title ? `${t} «${title}»` : t;
}

function sanitizeTaskFields(raw: unknown): Record<string, unknown> {
  const fields = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (str(fields.title)) out.title = str(fields.title);
  if (str(fields.priority)) out.priority = str(fields.priority);
  if (str(fields.deadline)) out.deadline = str(fields.deadline);
  if (num(fields.estimatedMinutes) !== undefined) out.estimatedMinutes = num(fields.estimatedMinutes);
  if (fields.description !== undefined) out.description = str(fields.description) ?? null;
  return out;
}

function describeFields(fields: Record<string, unknown>): string {
  const labels: Record<string, string> = {
    title: 'العنوان',
    priority: 'الأولوية',
    deadline: 'الموعد',
    estimatedMinutes: 'المدة',
    description: 'الوصف',
  };
  return Object.entries(fields)
    .map(([key, value]) => `${labels[key] ?? key}: ${String(value)}`)
    .join('، ') || 'تحديث';
}

function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}
