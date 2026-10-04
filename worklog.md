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

---
Task ID: cron-20261004-1
Agent: main (Z.ai Code) — webDevReview round 1
Task: QA + new features (BRD §11/§17/§28/§43) + styling polish

## Current project status
- Stable: MVP fully working from previous rounds (auth, AI chat with intents, tasks/projects/calendar/finance, planning, insights, notifications). Dev server healthy (200), no new runtime errors in dev.log (the 2 old `filter` errors in logs are historical, fixed earlier). lint + tsc clean.

## This round: completed modifications & verification
1. **AI Project Breakdown (BRD §11)** — NEW action `CREATE_PROJECT_WITH_TASKS` + intent `SUGGEST_PLAN`:
   - "عايز أعمل موقع لتطبيق توصيل أكل" → created project + 8 logical ordered tasks (verified live, reply lists all tasks).
   - NEW action `ADD_SUBTASKS`: "قسمل مهمة X لخطوات" → 3-6 subtasks under matched parent task.
   - Prompt rules 12-13 added; enums extended; ai-chat-use-cases handles both (auto-execute, low-risk creates).
2. **Personalization insights (BRD §17)** — new `personalizationInsights()` domain service over REAL history:
   - Peak productivity hours ("لاحظت إنك بتنجز أكتر بين X وY الصبح") from completedAt histogram (30d, needs ≥5 completions).
   - Daily completion average (14d), chronic procrastination warning (tasks >2 days late → suggests breakdown), streak praise (≥5 completions in 7d, no chronic overdue).
   - Wired into dashboard via `buildPersonalizationSnapshot()`; verified "بتخلص في المتوسط 0.1 مهام في اليوم" renders from demo data.
3. **Weekly summary (BRD §28)** — Saturday-only notification (Egyptian week start): completions + spend of last 7 days, deduped by refKey `weekly-{year}-W{week}`.
4. **TTS voice replies (BRD §43)** — سكرتير يتكلم:
   - New port `ITextToSpeechService` + `ZaiTextToSpeechService` (voice tongtong, wav, 1000-char cap) + `POST /api/ai/tts`.
   - Speaker 🔊 button on every assistant message (top corner): play/stop toggle with loading + pulse states, one-audio-at-a-time via audioRef. Verified in browser: `POST /api/ai/tts 200 in 2.8s` (712KB wav).
5. **Styling polish [mandatory]**:
   - New `FadeIn` component (framer-motion) — staggered entrance on home greeting/AI input/cards.
   - Hover lift (`hover:shadow-md hover:-translate-y-0.5 transition-all`) applied to all cards in tasks/projects/finance/calendar/home views.
   - Example chips updated to showcase breakdown («عايز أعمل موقع تخرج»).
   - PWA: public/manifest.json (RTL, ar, amber theme) + metadata manifest link.
   - Fixed greeting/suggestion overlap on desktop (-mt-3 → mt-1) — verified clean.

## Unresolved issues / risks & next priorities
- TTS voice (tongtong) is Chinese-optimized; Arabic pronunciation may sound accented — acceptable for MVP, consider testing other voices (xiaochen/kazi) later.
- Voice-record (ASR) path still untested end-to-end with a real mic (headless limitation); transcribe endpoint shape verified, WAV encoding handled client-side.
- Next round suggestions: personalization — average estimated vs actual duration per task category (BRD §17 "المهام التي تستغرق وقتًا أطول من المتوقع"); month navigation in finance view; transfers (BRD §19); repeat/recurring expansion test in calendar week view; dark mode consideration.

---
Task ID: cron-20261004-2
Agent: main (Z.ai Code) — webDevReview round 2
Task: Status assessment + browser QA + new features (time-tracking, duration-calibration insights, finance month nav) + styling polish

## Current project status
- STABLE. Full browser QA passed (desktop 1280px + mobile 390px): home/assistant/tasks/projects/calendar/finance all render correctly; multi-action AI message verified live ("دفعت 60 جنيه أكل، وبكرة عندي اجتماع الساعة 2 العصر" → expense + event), AI QUERY regression OK ("إيه مصاريفي الشهر ده؟" → answered from real data 1110/8000), auth-cookie flow verified via curl.
- The `filter` 500s in dev.log are HISTORICAL (old code line numbers; current guard at zai-assistant-service.ts:122 is correct). 0 runtime errors this round.

## This round: completed modifications & verification
1. **Task time-tracking (feeds BRD §17 personalization)** — NEW:
   - Schema: Task.`actualMinutes` (default 0) + Task.`trackingStartedAt`; `bun run db:push` OK.
   - Domain: TaskRecord/TaskDTO + serializeTask (`actualMinutes`, `trackingStartedAt`, `isTracking`); use-cases `startTracking`/`stopTracking` (min 1 min/session); auto-flush of open session when completing a tracked task (incl. recurring materialization path).
   - API: POST `/api/tasks/[id]/track` {action:'start'|'stop'}.
   - UI: play/stop button on every open task card, live "● شغّال Xد" emerald chip (ticks every 30s), "⏱ فعلي Xد" sky chip after stop, emerald ring on tracking card. E2E verified: start → stop → actual:1 in DB + toasts.
2. **Duration-calibration insights (BRD §17)** — `durationSamples` (last-30d completions with estimate AND tracked actual) → new rules in personalizationInsights: overall drift ≥30% (≥3 samples) → "شغلك الفعلي بياخد أكتر من تقديراتك بـ X%" (or faster ⚡); single-task outlier ≥2x estimate & ≥45min → suggests breaking it down. Wired via buildPersonalizationSnapshot.
3. **Finance month navigation** — prev/next month pill (RTL arrows match calendar: right = back), "رجوع لحدود النهارده" chip, future months disabled, budget title shows browsed month, budget edit hidden for past months ("للعرض بس"), "النهارده" tile becomes "عدد العمليات" for past months, add-dialog dates default into browsed month (clamped day). Backend fix: dailyAverage now divides by elapsed days (current month) vs daysInMonth (past months); spentToday forced 0 outside current month. Verified September vs October data render differently and correctly.
4. **Styling polish [mandatory]**: staggered `sekretir-rise` entrance on task/project cards; `sekretir-live-dot` soft ping for tracking chip; amber `::selection` + smooth scroll; hover-lift unified on task cards; FAB active:scale-95; emerald tracking-card ring.
5. **Infra note**: Prisma client is externalized — after any future `db:push`, the dev server must be RESTARTED for the new client to load (HMR keeps the old require cache; symptoms: new fields undefined → e.g. isTracking:true ghosts/NaN). Fixed this round by restarting next dev + bumping db.ts global key to `__sekretirPrismaV2`.

## Unresolved issues / risks & next priorities
- Timer chip shows whole minutes (ticks every 30s) — seconds precision intentionally omitted.
- ASR voice path still unverified with a real mic (headless env limitation); TTS Arabic accent acceptable (tongtong voice).
- Next round suggestions: per-task live timer on home timeline; budget copy from last month; habits/recurring check-in view (BRD §16); dark mode; per-category budget limits; weekly plan view (7-day planner grid).
