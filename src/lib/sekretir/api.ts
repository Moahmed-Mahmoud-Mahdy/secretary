// ============================================================
// Sekretir API client — typed fetch helpers matching the
// backend contract (Task 4 in worklog.md).
// Envelope: {success:true,data} | {success:false,error} — 401 = logged out.
// ============================================================

// ---------- Enums ----------
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type TaskStatusOrOverdue = TaskStatus | 'OVERDUE';
export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
export type ExpenseCategory =
  | 'FOOD' | 'TRANSPORT' | 'EDUCATION' | 'PROJECTS'
  | 'BILLS' | 'SHOPPING' | 'ENTERTAINMENT' | 'OTHER';
export type Recurrence = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type EventType = 'FIXED' | 'AI_PLANNED';
export type PlanSlotStatus = 'PLANNED' | 'DONE' | 'MISSED';
export type NotificationType =
  | 'TASK_REMINDER' | 'EVENT_REMINDER' | 'DEADLINE_WARNING' | 'OVERDUE_TASK'
  | 'BUDGET_ALERT' | 'WEEKLY_SUMMARY' | 'AI_SUGGESTION' | 'REPLAN';
export type InsightKind = 'INSIGHT' | 'WARNING' | 'IMPORTANT' | 'SUGGESTION';
export type InsightDomain = 'FINANCE' | 'TASKS' | 'PLANNING' | 'CALENDAR';
export type AiActionType =
  | 'CREATE_TASK' | 'CREATE_EVENT' | 'CREATE_EXPENSE' | 'CREATE_INCOME'
  | 'SET_BUDGET' | 'CREATE_PROJECT' | 'COMPLETE_TASK' | 'DELETE_TASK'
  | 'UPDATE_TASK' | 'DELETE_EVENT' | 'PLAN_DAY' | 'QUERY' | 'CHITCHAT';

// ---------- DTOs ----------
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
  status: TaskStatusOrOverdue;
  estimatedMinutes: number | null;
  deadline: string | null;
  reminderAt: string | null;
  recurrence: Recurrence | null;
  tags: string[];
  projectId: string | null;
  projectName?: string | null;
  parentId: string | null;
  subtasks: TaskDTO[];
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
  progress: number;
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

export interface OccurrenceDTO {
  key: string;
  kind: 'EVENT' | 'PLANNED_TASK';
  refId: string;
  eventId?: string | null;
  taskId?: string | null;
  title: string;
  startAt: string;
  endAt: string | null;
  eventType?: EventType;
  status?: PlanSlotStatus;
  priority?: Priority;
  isRecurring?: boolean;
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

export interface PlanSlotDTO {
  id: string;
  taskId: string;
  taskTitle: string;
  priority: Priority;
  startAt: string;
  endAt: string;
  status: PlanSlotStatus;
}

export interface DayPlanDTO {
  date: string;
  slots: PlanSlotDTO[];
  unplanned: { id: string; title: string }[];
  plannedMinutes: number;
  freeMinutes: number;
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

export interface AiExecutedAction {
  /** Backend returns kind strings like 'TASK' | 'EVENT' — kept loose for icon lookup. */
  type: string;
  action: unknown;
  summary: string;
  refId?: string | null;
}

export interface AiPendingAction {
  id: string;
  type: 'DELETE_TASK' | 'UPDATE_TASK' | 'DELETE_EVENT';
  title: string;
  summary: string;
  payload: Record<string, unknown>;
}

export interface AiQueryResult {
  queryType: string;
  question: string;
  data: unknown;
}

export interface AiChatResponse {
  reply: string;
  intent: string;
  executed: AiExecutedAction[];
  pending: AiPendingAction[];
  query: AiQueryResult | null;
  failed: unknown[];
}

export interface DashboardDTO {
  user: { id: string; name: string; firstName: string; monthlyBudget: number | null };
  today: string;
  greeting: string;
  schedule: OccurrenceDTO[];
  nextEvent: OccurrenceDTO | null;
  tasks: {
    overdue: TaskDTO[];
    dueToday: TaskDTO[];
    completedToday: number;
    activeTotal: number;
  };
  finance: {
    spentToday: number;
    monthSpent: number;
    budget: number;
    remaining: number;
    avgDailySpend: number;
  };
  insights: InsightDTO[];
  notifications: NotificationDTO[];
  unreadCount: number;
  suggestion: string | null;
  plan: { plannedMinutes: number; freeMinutes: number };
}

export interface FinanceSummaryDTO {
  month: string;
  budget: number;
  monthSpent: number;
  remaining: number;
  spentToday: number;
  incomeThisMonth: number;
  byCategory: { category: ExpenseCategory; total: number }[];
  expectedRecurringRestOfMonth: number;
  dailyAverage: number;
  expenses: ExpenseDTO[];
  incomes: IncomeDTO[];
  upcomingRecurring: {
    id: string;
    amount: number;
    category: ExpenseCategory;
    description: string | null;
    nextDueAt: string;
  }[];
}

// ---------- Fetch core ----------
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError('مفيش نتايج... اتحقق من النت وحاول تاني', 0);
  }
  if (res.status === 401) {
    throw new ApiError('محتاج تسجل دخول تاني', 401);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* ignore non-JSON */
  }
  const body = json as { success?: boolean; data?: T; error?: string } | null;
  if (!res.ok || !body?.success) {
    throw new ApiError(body?.error || 'حصلت مشكلة، حاول تاني', res.status);
  }
  return body.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function isAuthError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 401;
}

export function apiErrorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'حصلت مشكلة، حاول تاني';
}

// ---------- Endpoint helpers ----------
export const endpoints = {
  me: () => api.get<{ user: UserDTO | null }>('/api/auth/me'),
  login: (email: string, password: string) =>
    api.post<{ user: UserDTO }>('/api/auth/login', { email, password }),
  register: (name: string, email: string, password: string) =>
    api.post<{ user: UserDTO }>('/api/auth/register', { name, email, password }),
  logout: () => api.post<{ ok: boolean }>('/api/auth/logout'),

  chat: (message: string) => api.post<AiChatResponse>('/api/ai/chat', { message }),
  // NOTE: /api/ai/execute returns a single executed action object (backend shape),
  // while /api/ai/chat returns an array — normalize with normalizeExecuted().
  execute: (pending: AiPendingAction) =>
    api.post<{ executed: AiExecutedAction | AiExecutedAction[] }>(
      '/api/ai/execute',
      { pending } as Record<string, unknown>
    ),
  transcribe: (audio: string) => api.post<{ text: string }>('/api/ai/transcribe', { audio }),
  speak: (text: string) => api.post<{ audio: string; mimeType: string }>('/api/ai/tts', { text }),

  dashboard: () => api.get<DashboardDTO>('/api/dashboard'),

  tasks: (query?: string) => api.get<{ tasks: TaskDTO[] }>(`/api/tasks${query ? `?${query}` : ''}`),
  createTask: (body: Record<string, unknown>) => api.post<{ task: TaskDTO }>('/api/tasks', body),
  updateTask: (id: string, body: Record<string, unknown>) =>
    api.patch<{ task: TaskDTO }>(`/api/tasks/${id}`, body),
  deleteTask: (id: string) => api.del<{ deleted: boolean }>(`/api/tasks/${id}`),

  projects: () => api.get<{ projects: ProjectDTO[] }>('/api/projects'),
  createProject: (body: Record<string, unknown>) =>
    api.post<{ project: ProjectDTO }>('/api/projects', body),
  project: (id: string) => api.get<{ project: ProjectDTO; tasks: TaskDTO[] }>(`/api/projects/${id}`),
  updateProject: (id: string, body: Record<string, unknown>) =>
    api.patch<{ project: ProjectDTO }>(`/api/projects/${id}`, body),
  deleteProject: (id: string) => api.del<{ deleted: boolean }>(`/api/projects/${id}`),

  events: () => api.get<{ events: EventDTO[] }>('/api/events'),
  createEvent: (body: Record<string, unknown>) =>
    api.post<{ event: EventDTO }>('/api/events', body),
  updateEvent: (id: string, body: Record<string, unknown>) =>
    api.patch<{ event: EventDTO }>(`/api/events/${id}`, body),
  deleteEvent: (id: string) => api.del<{ deleted: boolean }>(`/api/events/${id}`),

  financeSummary: (month?: string) =>
    api.get<FinanceSummaryDTO>(`/api/budget${month ? `?month=${month}` : ''}`),
  setBudget: (amount: number) => api.post<{ budget: number }>('/api/budget', { amount }),

  expenses: (month?: string) =>
    api.get<{ expenses: ExpenseDTO[] }>(`/api/expenses${month ? `?month=${month}` : ''}`),
  createExpense: (body: Record<string, unknown>) =>
    api.post<{ expense: ExpenseDTO }>('/api/expenses', body),
  deleteExpense: (id: string) => api.del<{ deleted: boolean }>(`/api/expenses/${id}`),

  incomes: (month?: string) =>
    api.get<{ incomes: IncomeDTO[] }>(`/api/incomes${month ? `?month=${month}` : ''}`),
  createIncome: (body: Record<string, unknown>) =>
    api.post<{ income: IncomeDTO }>('/api/incomes', body),
  deleteIncome: (id: string) => api.del<{ deleted: boolean }>(`/api/incomes/${id}`),

  dayPlan: (date: string) => api.get<DayPlanDTO>(`/api/plan?date=${date}`),
  generatePlan: (date?: string) =>
    api.post<DayPlanDTO>('/api/plan', date ? { date } : {}),
  updateSlot: (id: string, status: PlanSlotStatus) =>
    api.patch<{ slot: PlanSlotDTO }>(`/api/plan/slots/${id}`, { status }),

  notifications: () =>
    api.get<{ notifications: NotificationDTO[]; unreadCount: number }>('/api/notifications'),
  markAllRead: () => api.post<{ ok: boolean }>('/api/notifications'),
  markRead: (id: string) => api.patch<{ notification: NotificationDTO }>(`/api/notifications/${id}`),
};
