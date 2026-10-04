// ============================================================
// Domain enums — SQLite has no native enums, so string unions
// are defined here and validated at the application boundary.
// ============================================================

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
/** Derived (never stored): deadline in the past & not finished. */
export const TASK_STATUS_OVERDUE = 'OVERDUE';

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PROJECT_STATUSES = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const EXPENSE_CATEGORIES = [
  'FOOD',
  'TRANSPORT',
  'EDUCATION',
  'PROJECTS',
  'BILLS',
  'SHOPPING',
  'ENTERTAINMENT',
  'OTHER',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const RECURRENCES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const EVENT_TYPES = ['FIXED', 'AI_PLANNED'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const PLAN_SLOT_STATUSES = ['PLANNED', 'DONE', 'MISSED'] as const;
export type PlanSlotStatus = (typeof PLAN_SLOT_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  'TASK_REMINDER',
  'EVENT_REMINDER',
  'DEADLINE_WARNING',
  'OVERDUE_TASK',
  'BUDGET_ALERT',
  'EXPECTED_EXPENSE',
  'WEEKLY_SUMMARY',
  'AI_SUGGESTION',
  'REPLAN',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const INSIGHT_KINDS = ['INSIGHT', 'WARNING', 'IMPORTANT', 'SUGGESTION'] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

export const INSIGHT_DOMAINS = ['FINANCE', 'TASKS', 'PLANNING', 'CALENDAR'] as const;
export type InsightDomain = (typeof INSIGHT_DOMAINS)[number];

/** AI intent classification (BRD §6, §9). */
export const AI_INTENTS = [
  'CREATE_TASK',
  'CREATE_EVENT',
  'CREATE_EXPENSE',
  'CREATE_INCOME',
  'SET_BUDGET',
  'CREATE_PROJECT',
  'COMPLETE_TASK',
  'DELETE_TASK',
  'UPDATE_TASK',
  'DELETE_EVENT',
  'UPDATE_EXPENSE',
  'UPDATE_INCOME',
  'PLAN_DAY',
  'QUERY',
  'CHITCHAT',
  'MULTI_ACTION',
  'SUGGEST_PLAN',
  'UNKNOWN',
] as const;
export type AiIntent = (typeof AI_INTENTS)[number];

export const AI_ACTION_TYPES = [
  'CREATE_TASK',
  'CREATE_EVENT',
  'CREATE_EXPENSE',
  'CREATE_INCOME',
  'SET_BUDGET',
  'SET_CATEGORY_BUDGET',
  'CREATE_PROJECT',
  'CREATE_PROJECT_WITH_TASKS',
  'ADD_SUBTASKS',
  'COMPLETE_TASK',
  'DELETE_TASK',
  'UPDATE_TASK',
  'DELETE_EVENT',
  'UPDATE_EXPENSE',
  'UPDATE_INCOME',
  'PLAN_DAY',
  'QUERY',
  'CHITCHAT',
] as const;
export type AiActionType = (typeof AI_ACTION_TYPES)[number];

/** Action classification used to decide auto-execute vs confirmation (BRD §8, §9). */
export type ActionClassification =
  | 'READ'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'BULK_ACTION'
  | 'SENSITIVE_ACTION';

// ---------- Arabic labels (UI-facing) ----------

export const CATEGORY_LABELS_AR: Record<ExpenseCategory, string> = {
  FOOD: 'أكل وشرب',
  TRANSPORT: 'مواصلات',
  EDUCATION: 'تعليم',
  PROJECTS: 'مشاريع',
  BILLS: 'فواتير',
  SHOPPING: 'تسوق',
  ENTERTAINMENT: 'ترفيه',
  OTHER: 'حاجات تانية',
};

export const CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  FOOD: '🍔',
  TRANSPORT: '🚌',
  EDUCATION: '📚',
  PROJECTS: '🛠️',
  BILLS: '💡',
  SHOPPING: '🛍️',
  ENTERTAINMENT: '🎮',
  OTHER: '📦',
};

export const PRIORITY_LABELS_AR: Record<Priority, string> = {
  LOW: 'عادية',
  MEDIUM: 'متوسطة',
  HIGH: 'مهمة',
  URGENT: 'مستعجلة',
};

export const RECURRENCE_LABELS_AR: Record<Recurrence, string> = {
  DAILY: 'كل يوم',
  WEEKLY: 'كل أسبوع',
  MONTHLY: 'كل شهر',
};
