import { TASK_STATUS_OVERDUE } from '../enums';
import type {
  EventRecord,
  ExpenseRecord,
  IncomeRecord,
  NotificationRecord,
  PlanSlotRecord,
  ProjectRecord,
  TaskDTO,
  TaskRecord,
  UserRecord,
} from '../types';
import { nowWall } from './time';

// ============================================================
// Record → DTO serializers (single place where domain records
// become API shapes; wall-clock dates become ISO strings).
// ============================================================

export function isTaskOverdue(task: TaskRecord, now: Date = nowWall()): boolean {
  return (
    task.deadline !== null &&
    task.deadline < now &&
    (task.status === 'TODO' || task.status === 'IN_PROGRESS')
  );
}

export function serializeUser(user: UserRecord): { id: string; name: string; email: string; monthlyBudget: number | null } {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    monthlyBudget: user.monthlyBudget,
  };
}

export function serializeTask(
  task: TaskRecord,
  subtasks: TaskRecord[] = [],
  projectName: string | null = null
): TaskDTO {
  const now = nowWall();
  const overdue =
    task.deadline !== null && task.deadline < now && (task.status === 'TODO' || task.status === 'IN_PROGRESS');
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: overdue ? TASK_STATUS_OVERDUE : task.status,
    estimatedMinutes: task.estimatedMinutes,
    deadline: task.deadline ? task.deadline.toISOString() : null,
    reminderAt: task.reminderAt ? task.reminderAt.toISOString() : null,
    recurrence: task.recurrence,
    tags: task.tags ? task.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    projectId: task.projectId,
    projectName,
    parentId: task.parentId,
    subtasks: subtasks
      .filter((st) => st.parentId === task.id)
      .map((st) => serializeTask(st)),
    actualMinutes: task.actualMinutes,
    trackingStartedAt: task.trackingStartedAt ? task.trackingStartedAt.toISOString() : null,
    isTracking: task.trackingStartedAt !== null,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    isOverdue: overdue,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function serializeProject(project: ProjectRecord, tasks: TaskRecord[]): import('../types').ProjectDTO {
  const relevant = tasks.filter((t) => t.projectId === project.id && t.parentId === null);
  const done = relevant.filter((t) => t.status === 'COMPLETED').length;
  const count = relevant.length;
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    priority: project.priority,
    deadline: project.deadline ? project.deadline.toISOString() : null,
    tasksCount: count,
    doneCount: done,
    progress: count === 0 ? 0 : Math.round((done / count) * 100),
    createdAt: project.createdAt.toISOString(),
  };
}

export function serializeEvent(event: EventRecord): import('../types').EventDTO {
  return {
    id: event.id,
    title: event.title,
    notes: event.notes,
    eventType: event.eventType,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt ? event.endAt.toISOString() : null,
    recurrence: event.recurrence,
    reminderAt: event.reminderAt ? event.reminderAt.toISOString() : null,
  };
}

export function serializeExpense(expense: ExpenseRecord): import('../types').ExpenseDTO {
  return {
    id: expense.id,
    amount: expense.amount,
    category: expense.category,
    description: expense.description,
    date: expense.date.toISOString(),
    isRecurring: expense.isRecurring,
    recurrence: expense.recurrence,
    nextDueAt: expense.nextDueAt ? expense.nextDueAt.toISOString() : null,
  };
}

export function serializeIncome(income: IncomeRecord): import('../types').IncomeDTO {
  return {
    id: income.id,
    amount: income.amount,
    source: income.source,
    description: income.description,
    date: income.date.toISOString(),
  };
}

export function serializePlanSlot(slot: PlanSlotRecord, taskTitle: string, priority: TaskRecord['priority']): import('../types').PlanSlotDTO {
  return {
    id: slot.id,
    taskId: slot.taskId,
    taskTitle,
    priority,
    startAt: slot.startAt.toISOString(),
    endAt: slot.endAt.toISOString(),
    status: slot.status,
  };
}

export function serializeNotification(notification: NotificationRecord): import('../types').NotificationDTO {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    isRead: notification.isRead,
    createdAt: notification.createdAt.toISOString(),
  };
}
