import type {
  BudgetRecord,
  CategoryBudgetRecord,
  EventRecord,
  ExpenseRecord,
  IncomeRecord,
  NotificationRecord,
  PlanSlotRecord,
  ProjectRecord,
  TaskRecord,
  UserRecord,
} from './types';
import type { Priority, PlanSlotStatus, ProjectStatus, Recurrence, TaskStatus } from './enums';

// ============================================================
// Repository interfaces (dependency inversion — the application
// layer depends on these, infrastructure implements them).
// ============================================================

export interface IUserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(data: { name: string; email: string; passwordHash: string }): Promise<UserRecord>;
  setMonthlyBudget(userId: string, amount: number | null): Promise<void>;
}

export interface CreateTaskData {
  title: string;
  description?: string | null;
  priority?: Priority;
  status?: TaskStatus;
  estimatedMinutes?: number | null;
  deadline?: Date | null;
  reminderAt?: Date | null;
  recurrence?: Recurrence | null;
  tags?: string | null;
  projectId?: string | null;
  parentId?: string | null;
}

export interface UpdateTaskData {
  title?: string;
  description?: string | null;
  priority?: Priority;
  status?: TaskStatus;
  estimatedMinutes?: number | null;
  deadline?: Date | null;
  reminderAt?: Date | null;
  recurrence?: Recurrence | null;
  tags?: string | null;
  projectId?: string | null;
  completedAt?: Date | null;
  actualMinutes?: number;
  trackingStartedAt?: Date | null;
}

export interface ITaskRepository {
  listAll(userId: string): Promise<TaskRecord[]>;
  findById(userId: string, id: string): Promise<TaskRecord | null>;
  create(userId: string, data: CreateTaskData): Promise<TaskRecord>;
  update(userId: string, id: string, data: UpdateTaskData): Promise<TaskRecord | null>;
  delete(userId: string, id: string): Promise<boolean>;
}

export interface CreateProjectData {
  name: string;
  description?: string | null;
  priority?: Priority;
  status?: ProjectStatus;
  deadline?: Date | null;
}

export interface IProjectRepository {
  listAll(userId: string): Promise<ProjectRecord[]>;
  findById(userId: string, id: string): Promise<ProjectRecord | null>;
  create(userId: string, data: CreateProjectData): Promise<ProjectRecord>;
  update(userId: string, id: string, data: Partial<CreateProjectData>): Promise<ProjectRecord | null>;
  delete(userId: string, id: string): Promise<boolean>;
}

export interface CreateEventData {
  title: string;
  notes?: string | null;
  eventType?: 'FIXED' | 'AI_PLANNED';
  startAt: Date;
  endAt?: Date | null;
  recurrence?: Recurrence | null;
  reminderAt?: Date | null;
}

export interface IEventRepository {
  listAll(userId: string): Promise<EventRecord[]>;
  findById(userId: string, id: string): Promise<EventRecord | null>;
  create(userId: string, data: CreateEventData): Promise<EventRecord>;
  update(userId: string, id: string, data: Partial<CreateEventData>): Promise<EventRecord | null>;
  delete(userId: string, id: string): Promise<boolean>;
}

export interface DateRange {
  from?: Date;
  to?: Date;
}

export interface CreateExpenseData {
  amount: number;
  category: ExpenseRecord['category'];
  description?: string | null;
  date?: Date;
  isRecurring?: boolean;
  recurrence?: Recurrence | null;
  nextDueAt?: Date | null;
}

export interface UpdateExpenseData {
  amount?: number;
  category?: ExpenseRecord['category'];
  description?: string | null;
  date?: Date;
}

export interface CreateIncomeData {
  amount: number;
  source?: string | null;
  description?: string | null;
  date?: Date;
}

export interface UpdateIncomeData {
  amount?: number;
  source?: string | null;
  description?: string | null;
  date?: Date;
}

export interface IFinanceRepository {
  listExpenses(userId: string, range?: DateRange): Promise<ExpenseRecord[]>;
  createExpense(userId: string, data: CreateExpenseData): Promise<ExpenseRecord>;
  updateExpense(userId: string, id: string, data: UpdateExpenseData): Promise<ExpenseRecord | null>;
  deleteExpense(userId: string, id: string): Promise<boolean>;
  listIncomes(userId: string, range?: DateRange): Promise<IncomeRecord[]>;
  createIncome(userId: string, data: CreateIncomeData): Promise<IncomeRecord>;
  updateIncome(userId: string, id: string, data: UpdateIncomeData): Promise<IncomeRecord | null>;
  deleteIncome(userId: string, id: string): Promise<boolean>;
  getBudgetAmount(userId: string, month: number, year: number): Promise<number | null>;
  setBudgetAmount(userId: string, month: number, year: number, amount: number): Promise<void>;
  listCategoryBudgets(userId: string, month: number, year: number): Promise<CategoryBudgetRecord[]>;
  /** amount = null removes the limit for that category. */
  setCategoryBudget(userId: string, month: number, year: number, category: CategoryBudgetRecord['category'], amount: number | null): Promise<void>;
}

export interface IPlanRepository {
  listSlotsForDay(userId: string, dayStart: Date, dayEnd: Date): Promise<PlanSlotRecord[]>;
  listSlotsForTasks(userId: string, taskIds: string[]): Promise<PlanSlotRecord[]>;
  replaceDaySlots(
    userId: string,
    dayStart: Date,
    slots: { taskId: string; startAt: Date; endAt: Date }[]
  ): Promise<void>;
  updateSlotStatus(userId: string, slotId: string, status: PlanSlotStatus): Promise<boolean>;
  /** Removes a task's open (PLANNED) slots from `from` onwards — used when a task is postponed. Returns the deleted count. */
  deleteFutureSlotsForTask(userId: string, taskId: string, from: Date): Promise<number>;
}

export interface CreateNotificationData {
  type: NotificationRecord['type'];
  title: string;
  body: string;
  refKey?: string | null;
}

export interface INotificationRepository {
  listRecent(userId: string, limit?: number): Promise<NotificationRecord[]>;
  listUnread(userId: string): Promise<NotificationRecord[]>;
  unreadCount(userId: string): Promise<number>;
  /** Creates notifications, skipping ones whose refKey already exists (dedupe). */
  createManyDeduped(userId: string, items: CreateNotificationData[]): Promise<void>;
  markRead(userId: string, id: string): Promise<boolean>;
  markAllRead(userId: string): Promise<void>;
}

export interface BudgetSnapshotRecord extends BudgetRecord {}
