import { db } from '@/lib/db';
import { AuthUseCases } from './application/use-cases/auth-use-cases';
import { TaskUseCases } from './application/use-cases/task-use-cases';
import { ProjectUseCases } from './application/use-cases/project-use-cases';
import { EventUseCases } from './application/use-cases/event-use-cases';
import { FinanceUseCases } from './application/use-cases/finance-use-cases';
import { PlanningUseCases } from './application/use-cases/planning-use-cases';
import { DashboardUseCases } from './application/use-cases/dashboard-use-cases';
import { AiChatUseCases } from './application/use-cases/ai-chat-use-cases';

import { BcryptPasswordHasher } from './infrastructure/auth/bcrypt-hasher';
import { JoseTokenService } from './infrastructure/auth/jose-token-service';
import { ZaiAssistantService } from './infrastructure/ai/zai-assistant-service';
import { ZaiSpeechService } from './infrastructure/ai/zai-speech-service';

import { PrismaUserRepository } from './infrastructure/repositories/prisma-user-repository';
import { PrismaTaskRepository } from './infrastructure/repositories/prisma-task-repository';
import { PrismaProjectRepository } from './infrastructure/repositories/prisma-project-repository';
import { PrismaEventRepository } from './infrastructure/repositories/prisma-event-repository';
import { PrismaFinanceRepository } from './infrastructure/repositories/prisma-finance-repository';
import {
  PrismaPlanRepository,
  PrismaNotificationRepository,
} from './infrastructure/repositories/prisma-plan-notification-repositories';

// ============================================================
// Composition root — the only place where infrastructure is
// wired into the application layer (Dependency Injection).
// API routes (presentation) resolve use cases from here only.
// ============================================================

// ---- repositories ----
const users = new PrismaUserRepository(db);
const tasks = new PrismaTaskRepository(db);
const projects = new PrismaProjectRepository(db);
const events = new PrismaEventRepository(db);
const finance = new PrismaFinanceRepository(db);
const plans = new PrismaPlanRepository(db);
const notifications = new PrismaNotificationRepository(db);

// ---- infrastructure services ----
const hasher = new BcryptPasswordHasher();
const tokens = new JoseTokenService(process.env.AUTH_SECRET);
const ai = new ZaiAssistantService();
const speech = new ZaiSpeechService();

export const tokenService = tokens;

// ---- use cases ----
const taskUseCases = new TaskUseCases(tasks, projects, plans);
const projectUseCases = new ProjectUseCases(projects, tasks);
const eventUseCases = new EventUseCases(events, plans, tasks);
const financeUseCases = new FinanceUseCases(finance, users);
const planningUseCases = new PlanningUseCases(tasks, events, plans);
const dashboardUseCases = new DashboardUseCases(users, tasks, events, finance, plans, notifications);
const aiChatUseCases = new AiChatUseCases(
  users,
  tasks,
  projects,
  events,
  finance,
  plans,
  ai,
  taskUseCases,
  financeUseCases,
  planningUseCases,
  eventUseCases,
  projectUseCases
);
const authUseCases = new AuthUseCases(users, hasher, tokens);

export const container = {
  users,
  tasks,
  projects,
  events,
  finance,
  plans,
  notifications,
  speech,
  authUseCases,
  taskUseCases,
  projectUseCases,
  eventUseCases,
  financeUseCases,
  planningUseCases,
  dashboardUseCases,
  aiChatUseCases,
};

export type Container = typeof container;
