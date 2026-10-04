import type {
  ExpenseCategory,
  EventType,
  InsightDomain,
  InsightKind,
  NotificationType,
  PlanSlotStatus,
  Priority,
  ProjectStatus,
  Recurrence,
  TaskStatus,
} from './enums';

// ============================================================
// Domain records — raw entities as persisted (Date objects kept).
// ============================================================

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  monthlyBudget: number | null;
  createdAt: Date;
}

export interface TaskRecord {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  estimatedMinutes: number | null;
  deadline: Date | null;
  reminderAt: Date | null;
  recurrence: Recurrence | null;
  tags: string | null;
  projectId: string | null;
  parentId: string | null;
  actualMinutes: number;
  trackingStartedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectRecord {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: Priority;
  deadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventRecord {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  eventType: EventType;
  startAt: Date;
  endAt: Date | null;
  recurrence: Recurrence | null;
  reminderAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpenseRecord {
  id: string;
  userId: string;
  amount: number;
  category: ExpenseCategory;
  description: string | null;
  date: Date;
  isRecurring: boolean;
  recurrence: Recurrence | null;
  nextDueAt: Date | null;
  createdAt: Date;
}

export interface IncomeRecord {
  id: string;
  userId: string;
  amount: number;
  source: string | null;
  description: string | null;
  date: Date;
  createdAt: Date;
}

export interface BudgetRecord {
  id: string;
  userId: string;
  month: number;
  year: number;
  amount: number;
}

export interface CategoryBudgetRecord {
  category: ExpenseCategory;
  amount: number;
}

export interface PlanSlotRecord {
  id: string;
  userId: string;
  taskId: string;
  date: Date;
  startAt: Date;
  endAt: Date;
  status: PlanSlotStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  refKey: string | null;
  createdAt: Date;
}

// ============================================================
// DTOs — serialized shapes returned by the API (dates as ISO
// strings encoding Cairo wall-clock time).
// ============================================================

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  monthlyBudget: number | null;
}

export interface TaskDTO {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus | 'OVERDUE';
  estimatedMinutes: number | null;
  deadline: string | null;
  reminderAt: string | null;
  recurrence: Recurrence | null;
  tags: string[];
  projectId: string | null;
  projectName?: string | null;
  parentId: string | null;
  subtasks: TaskDTO[];
  actualMinutes: number;
  trackingStartedAt: string | null;
  isTracking: boolean;
  completedAt: string | null;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDTO {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: Priority;
  deadline: string | null;
  tasksCount: number;
  doneCount: number;
  progress: number; // 0..100
  createdAt: string;
}

export interface EventDTO {
  id: string;
  title: string;
  notes: string | null;
  eventType: EventType;
  startAt: string;
  endAt: string | null;
  recurrence: Recurrence | null;
  reminderAt: string | null;
}

/** A concrete occurrence (expanded recurrence) shown on a day. */
export interface OccurrenceDTO {
  key: string;
  kind: 'EVENT' | 'PLANNED_TASK';
  refId: string; // eventId or slotId
  eventId?: string | null;
  taskId?: string | null;
  title: string;
  startAt: string;
  endAt: string | null;
  eventType?: EventType;
  status?: PlanSlotStatus;
  priority?: Priority;
  isRecurring?: boolean;
  /** Live time-tracking state of the underlying task (BRD §17). */
  taskIsTracking?: boolean;
  taskTrackingStartedAt?: string | null;
}

export interface ExpenseDTO {
  id: string;
  amount: number;
  category: ExpenseCategory;
  description: string | null;
  date: string;
  isRecurring: boolean;
  recurrence: Recurrence | null;
  nextDueAt: string | null;
}

export interface IncomeDTO {
  id: string;
  amount: number;
  source: string | null;
  description: string | null;
  date: string;
}

/** A recurring habit (recurring open task) with its check-in streak (BRD §16). */
export interface HabitDTO {
  id: string;
  title: string;
  recurrence: Recurrence;
  deadline: string | null;
  estimatedMinutes: number | null;
  isDueToday: boolean;
  /** Current consecutive check-ins (days for DAILY, weeks for WEEKLY, months for MONTHLY). */
  streak: number;
  /** Longest streak ever recorded for this habit. */
  bestStreak: number;
  totalCompletions: number;
  lastCompletedAt: string | null;
}

export interface PlanSlotDTO {
  id: string;
  taskId: string;
  taskTitle: string;
  priority: Priority;
  startAt: string;
  endAt: string;
  status: PlanSlotStatus;
  /** Live time-tracking state of the underlying task (BRD §17). */
  taskIsTracking?: boolean;
  taskTrackingStartedAt?: string | null;
}

export interface DayPlanDTO {
  date: string;
  slots: PlanSlotDTO[];
  unplanned: { id: string; title: string }[];
  plannedMinutes: number;
  freeMinutes: number;
}

export interface WeekPlanDTO {
  start: string;
  days: { date: string; slots: PlanSlotDTO[]; plannedMinutes: number }[];
}

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export interface InsightDTO {
  id: string;
  kind: InsightKind;
  domain: InsightDomain;
  icon: string;
  text: string;
}

// ============================================================
// Global search + data export (BRD §43 productivity helpers)
// ============================================================

export interface SearchHitTask {
  id: string;
  title: string;
  priority: Priority;
  status: TaskStatus | 'OVERDUE';
  isOverdue: boolean;
  deadline: string | null;
  projectName: string | null;
}

export interface SearchHitProject {
  id: string;
  name: string;
  progress: number;
  tasksCount: number;
}

export interface SearchHitEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
}

export interface SearchHitExpense {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  date: string;
}

export interface SearchHitIncome {
  id: string;
  amount: number;
  source: string | null;
  date: string;
}

export interface SearchResultsDTO {
  query: string;
  tasks: SearchHitTask[];
  projects: SearchHitProject[];
  events: SearchHitEvent[];
  expenses: SearchHitExpense[];
  incomes: SearchHitIncome[];
}

// ============================================================
// AI-related shared types
// ============================================================

export interface AiUserContext {
  userName: string;
  firstName: string;
  nowIso: string;
  weekdayName: string;
  dayKey: string;
  projects: string[];
  openTasks: { id: string; title: string }[];
}
