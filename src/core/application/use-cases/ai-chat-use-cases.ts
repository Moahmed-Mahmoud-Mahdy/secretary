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
      case 'SET_BUDGET': {
        const amount = num(action.amount);
        if (!amount) throw new Error('budget without amount');
        await this.financeUseCases.setBudget(userId, amount);
        executed.push({ type: 'BUDGET', action: 'CREATED', summary: `ظبطت ميزانية الشهر على ${formatAmount(amount)} جنيه` });
        return;
      }
      case 'CREATE_PROJECT': {
        const name = str(action.name) ?? str(action.title);
        if (!name) throw new Error('project without name');
        const created = await this.projectUseCases.create(userId, { name, deadline: str(action.deadline) });
        executed.push({ type: 'PROJECT', action: 'CREATED', summary: `عملتلك مشروع «${created.name}»`, refId: created.id });
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
      default: {
        const [summary, dayOccurrences] = await Promise.all([
          this.financeUseCases.summary(userId),
          this.dayOccurrences(userId, dayKeyOf(now)),
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
