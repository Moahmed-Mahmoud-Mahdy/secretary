# سكرتير (Sekretir) — Worklog

Personal AI Assistant — Egyptian Arabic, Onion Architecture, Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui + Prisma (SQLite) + JWT auth + z-ai SDK (LLM/ASR).

---

Task ID: 1
Agent: main (Z.ai Code)
Task: Explore project & environment

Work Log:
- Verified dev server running on port 3000 (HTTP 200)
- package.json: Next 16, React 19, Tailwind 4, Prisma 6, zustand, z-ai-web-dev-sdk 0.0.18 available
- .env has DATABASE_URL=file:/home/z/my-project/db/custom.db
- Added `AUTH_SECRET` to .env

Stage Summary:
- Environment ready; loaded LLM + ASR + image-generation skill docs.

---
Task ID: 2
Agent: main (Z.ai Code)
Task: Prisma schema + demo seed

Work Log:
- Rewrote prisma/schema.prisma: User, Project, Task (self-relation subtasks), CalendarEvent, Expense, Income, Budget (unique per user/month/year), PlanSlot, Notification
- `bun run db:push` OK; bcryptjs + jose installed
- scripts/seed-demo.ts: demo account **demo@sekretir.app / 123456** (name: مهدي) with projects (مشروع POS، مشروع التخرج), 7 tasks (1 overdue), 3 events, 12 expenses + 1 recurring internet bill, 2 incomes, budget 8000 EGP, 1 plan slot

Stage Summary:
- IMPORTANT convention: all DateTimes are **Cairo WALL-CLOCK time encoded as UTC** (10:00 Cairo == `T10:00:00.000Z` on disk). Format with UTC getters on the client (`getUTCHours()` etc.). Client "today" = `Intl.DateTimeFormat('en-CA', {timeZone:'Africa/Cairo'})` → "YYYY-MM-DD".

---
Task ID: 3
Agent: main (Z.ai Code)
Task: Onion Architecture core (backend complete)

Work Log:
- src/core/domain/: enums.ts (statuses/priorities/categories/AI intents + Arabic labels), errors.ts (AppError hierarchy, Arabic messages), types.ts (records + DTOs), repositories.ts (interfaces), services/: time.ts (wall-clock helpers), recurrence.ts, planner.ts (greedy first-fit day planner, overdue-first sort), insights.ts (finance/task/planning/calendar insight rules), serialize.ts
- src/core/application/: ports.ts (IPasswordHasher, ITokenService, IAiAssistantService, ISpeechToTextService), use-cases/: auth, task (fuzzy Arabic title matching in matchTaskTitle), project, event (day occurrences merging events+slots), finance (summary/budget/recurring), planning (getDayPlan, generatePlan re-planning), dashboard (context-aware home + notification sync), ai-chat (intent → validated actions → auto-execute/confirm → Egyptian replies)
- src/core/infrastructure/: bcrypt-hasher, jose-token-service (HS256, 7d), prisma repositories (user/task/project/event/finance/plan+notification), zai-assistant-service (strict-JSON intent engine with retry + fence stripping), zai-speech-service
- src/core/container.ts: composition root (DI)
- src/lib/api.ts: ok/fail envelope, handleRoute, requireUserId, AUTH_COOKIE='sekretir_token' (httpOnly)

Stage Summary:
- Backend 100% done & smoke-tested. AI pipeline verified end-to-end:
  - "النهارده دفعت 100 جنيه مواصلات، وبكرة عندي محاضرة الساعة 10، وبعدها عايز أذاكر Algorithms ساعتين" → expense + event + task created, reply: "ماشي يا مهدي: سجلت 100 جنيه مواصلات، وكمان ضفت «محاضرة» بكرة الساعة 10:00، وكمان عملتلك مهمة «أذاكر Algorithms»..."
  - Queries answer from real data ("مصاريفك الشهرده ٨٦٠ جنيه... باقي معاك ٧١٤٠")
  - DELETE/UPDATE need confirmation via /api/ai/execute (tested OK)
  - Plan generation schedules open tasks into free gaps (tested OK)

---
Task ID: 4
Agent: main (Z.ai Code)
Task: API routes (all done)

Work Log:
- auth: POST /api/auth/register, /login, /logout, GET /api/auth/me
- ai: POST /api/ai/chat, POST /api/ai/execute, POST /api/ai/transcribe
- tasks: GET/POST /api/tasks, PATCH/DELETE /api/tasks/[id]
- projects: GET/POST /api/projects, GET/PATCH/DELETE /api/projects/[id]
- events: GET/POST /api/events, PATCH/DELETE /api/events/[id]
- expenses: GET/POST /api/expenses, DELETE /api/expenses/[id]; incomes: GET/POST /api/incomes, DELETE /api/incomes/[id]
- budget: GET/POST /api/budget (GET = full finance summary)
- plan: GET /api/plan?date=, POST /api/plan {date?}, PATCH /api/plan/slots/[id] {status}
- dashboard: GET /api/dashboard; insights: GET /api/insights; notifications: GET/POST /api/notifications (POST = read all), PATCH /api/notifications/[id]

Stage Summary — **API CONTRACT (frontend must use this)**:
- Envelope: `{success: true, data: ...}` or `{success: false, error: string}`. 401 = logged out.
- All ISO datetime strings are Cairo wall-clock (display with UTC getters). Day params = "YYYY-MM-DD".
- POST /api/auth/register|login → `{user:{id,name,email,monthlyBudget}}` (+httpOnly cookie). GET /api/auth/me → `{user}` | 401.
- POST /api/ai/chat {message} → `{reply, intent, executed:[{type,action,summary,refId?}], pending:[{id,type:'DELETE_TASK'|'UPDATE_TASK'|'DELETE_EVENT',title,summary,payload}], query:{queryType,question,data}|null, failed:[]}`. Show reply as assistant bubble, executed as chips/cards, pending as confirmation card (buttons call POST /api/ai/execute {pending} → `{executed}`).
- POST /api/ai/transcribe {audio: base64 WAV} → `{text}` (record WAV client-side, 16kHz mono ideal).
- GET /api/dashboard → `{user:{id,name,firstName,monthlyBudget}, today, greeting, schedule: OccurrenceDTO[], nextEvent, tasks:{overdue:[],dueToday:[],completedToday,activeTotal}, finance:{spentToday,monthSpent,budget,remaining,avgDailySpend}, insights:[{id,kind:'INSIGHT'|'WARNING'|'IMPORTANT'|'SUGGESTION',domain,icon,text}], notifications:[], unreadCount, suggestion, plan:{plannedMinutes,freeMinutes}}`
- OccurrenceDTO: `{key,kind:'EVENT'|'PLANNED_TASK',refId,eventId?,taskId?,title,startAt,endAt,eventType?,status?,priority?,isRecurring?}`
- GET /api/tasks?status=OPEN|OVERDUE|TODO|... → `{tasks:[TaskDTO]}`; TaskDTO: `{id,title,description,priority,status('OVERDUE' derived),estimatedMinutes,deadline,recurrence,tags[],projectId,projectName,parentId,subtasks[],isOverdue,completedAt,createdAt}`. POST create → `{task}`; PATCH update (any field + status) → `{task}`; DELETE → `{deleted}`.
- GET /api/projects → `{projects:[{id,name,description,status,priority,deadline,tasksCount,doneCount,progress}]}`; POST {name,description?,deadline?,priority?}; GET /[id] → `{project, tasks}`; PATCH; DELETE.
- GET /api/events → `{events:[{id,title,notes,eventType,startAt,endAt,recurrence}]}`; POST {title,date:'YYYY-MM-DD',startTime:'HH:mm',endTime?,recurrence?,notes?}; PATCH/[id]; DELETE/[id].
- GET /api/budget?month=YYYY-MM → finance summary `{month,budget,monthSpent,remaining,spentToday,incomeThisMonth,byCategory:[{category,total}],expectedRecurringRestOfMonth,dailyAverage,expenses:[],incomes:[],upcomingRecurring:[{id,amount,category,description,nextDueAt}]}`; POST {amount} sets budget.
- POST /api/expenses {amount,category,description?,date?,isRecurring?,recurrence?}; GET ?month=; DELETE /[id]. POST /api/incomes {amount,source?,date?}; GET; DELETE /[id].
- GET /api/plan?date= → `{date,slots:[{id,taskId,taskTitle,priority,startAt,endAt,status}],unplanned:[{id,title}],plannedMinutes,freeMinutes}`; POST /api/plan {date?} regenerates; PATCH /api/plan/slots/[id] {status:'DONE'|'MISSED'|'PLANNED'}.
- GET /api/notifications → `{notifications:[{id,type,title,body,isRead,createdAt}],unreadCount}`; POST = mark all read; PATCH /[id] = mark one read.
- Categories: FOOD, TRANSPORT, EDUCATION, PROJECTS, BILLS, SHOPPING, ENTERTAINMENT, OTHER. Priorities: LOW, MEDIUM, HIGH, URGENT.
- Demo account: demo@sekretir.app / 123456 (re-seed: `bun scripts/seed-demo.ts`).

---
Task ID: 5
Agent: main (Z.ai Code)
Task: Logo

Work Log:
- Generated /public/logo.png (1024x1024, warm amber robot secretary icon)

Stage Summary:
- Use `/logo.png` in auth screen + header.

---
Task ID: 6
Agent: full-stack-developer (+ main finishing QA)
Task: Frontend UI build — سكرتير (RTL Egyptian Arabic)

Work Log:
- layout.tsx: lang="ar" dir="rtl", Cairo font (Google Fonts link), metadata "سكرتير — مساعدك الشخصي الذكي", sonner Toaster, viewport themeColor
- src/lib/sekretir/: api.ts (typed endpoints + DTOs), date-utils.ts (Cairo wall-clock UTC-getter helpers: fmtTime, relativeDay, todayKey via Intl timeZone Africa/Cairo), constants.ts (Arabic category labels/icons, priority labels)
- src/components/sekretir/: auth-screen (login/register tabs + تجربة سريعة demo button), app-shell (header logo/bell/user + desktop tabs + mobile bottom nav + sticky footer), ai-input (unified input + mic MediaRecorder → WAV encode → /api/ai/transcribe), home-view (context-aware: greeting, AI input, جدولك النهارده timeline, مهامك chips, insights feed, quick actions), assistant-view (chat with localStorage persistence, executed chips, pending confirmation cards → /api/ai/execute, typing indicator, welcome examples), tasks-view (filters, quick add, checkboxes, priority/deadline/project badges, edit dialog, subtasks), projects-view (progress bars, detail sheet, add-task inline), calendar-view (week strip, merged occurrences, mark slot DONE/ MISSED, add fixed event dialog with recurrence), finance-view (budget card + inline edit, category bars, upcoming recurring, transactions with add/delete), notifications-popover (bell badge, mark read/all)
- page.tsx: auth gate via /api/auth/me, view switching, refreshKey re-fetch loop, queued message handoff (home quick actions → assistant)

Stage Summary:
- All 6 views + auth implemented, lint passes, types pass, dev server compiles clean.
- Design: amber-600 primary, stone-50 bg, emerald/rose for money, rounded-2xl cards, RTL everywhere, mobile bottom nav with safe-area, desktop sticky footer.

---
Task ID: 7
Agent: main (Z.ai Code)
Task: Integration QA via agent-browser (E2E)

Work Log:
- Browser E2E on http://localhost:3000 (demo@sekretir.app):
  - Auth session persisted; Home renders greeting "نورك سعيد يا مهدي 🌙", suggestion, جدولك النهارده (events + AI slots merged), مهامك summary — ✓
  - Chat "دفعت 75 جنيه فواتير الكهربا" → interpreted CREATE_EXPENSE(BILLS, 75) → reply "تمام يا مهدي: سجلت 75 جنيه فواتير" + executed chip — ✓
  - Chat "امسح مهمة أذاكر Algorithms — Graphs" → pending confirmation card (تأكيد/إلغاء) → clicking تأكيد → toast "تم التنفيذ ✅", card → chip "تمسحت مهمة", task deleted in DB — ✓
  - Tasks view: filters, priority badges, deadline chips, project chips — ✓
  - Projects view: progress 50% (1/2 مهام), badges — ✓
  - Calendar view: week strip, merged events+slots with تعديل/شيله من الخطة, "مخطط 4 سا • فاضي 10 سا" — ✓
  - Finance view: budget 7,015 فاضل من 8,000, stats (صرفت الشهر 985 / النهارده 320 / متوسط يومي 246.25), category bars BILLS/FOOD/TRANSPORT — ✓
  - Mobile 390x844: bottom nav + RTL layout — ✓
- Fixed during QA: (1) AI actions=[] crash → Array.isArray guard + intent→command fallback (QUERY/CHITCHAT/PLAN_DAY); (2) prompt: QUERY must include QUERY action; (3) expense summary template polish ("سجلت 40 جنيه على مواصلات"); (4) AI description = short item name rule.
- Final: `bun run lint` clean, `tsc --noEmit` clean (app code), dev.log free of runtime errors.

Stage Summary:
- MVP COMPLETE & browser-verified: unified AI input (text+voice), smart auto-execute + confirmations, tasks/projects/calendar/finance, planning & re-planning, insights, notifications, JWT auth with data isolation.

---
Task ID: 8
Agent: main (Z.ai Code)
Task: Handover + scheduled webDevReview

Work Log:
- Created cron job: webDevReview every 15 min (fixed_rate 900) — QA via agent-browser, fix bugs, propose/apply new requirements, keep improving styling & features, update this worklog.

Stage Summary:
- Handover notes: demo account demo@sekretir.app/123456 (re-seed `bun scripts/seed-demo.ts`); wall-clock Cairo convention (UTC getters on client); AI contract in Task 4 section; key files: src/core/** (onion layers), src/lib/sekretir/** + src/components/sekretir/** (frontend).
- Suggested next steps: weekly summary notification (Saturday), TTS voice replies, personalization stats (avg task duration per category), subtask AI breakdown ("عايز أعمل موقع تخرج" → task list), recurring task expansion in calendar month view, PWA manifest.
