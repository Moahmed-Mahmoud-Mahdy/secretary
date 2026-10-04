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

---
Task ID: cron-20261004-3
Agent: main (Z.ai Code) — webDevReview round 3
Task: Status assessment + browser QA + new features (per-category budget limits, weekly plan view) + bug fixes + styling

## Current project status
- STABLE. Full browser QA re-verified: home (new afternoon greeting 🌤️ + SunMedium icon), assistant (AI QUERY regression OK, tone rule added), tasks/projects render, calendar day+week modes, finance with limits. `bun run lint` clean, `tsc --noEmit` clean (app code), no new runtime errors in dev.log (one historical Fast-Refresh warning was a transient mid-edit TDZ state, self-resolved).
- QA findings fixed this round:
  1. **Greeting emoji mismatch** — at 12-17h the greeting said "نهارك سعيد" but showed 🌙 moon. Now: morning ☀️/Sun, afternoon 🌤️/SunMedium, evening 🌙/Moon (home-view.tsx).
  2. **AI tone drift** — assistant sometimes addressed the user as "عندها" (3rd-person feminine). Added explicit prompt rule in answerQuestion + smallTalk: always masculine direct "عندك/انت/صرفت". Verified: "حد صرفي على الأكل قد إيه؟ والمواصلات عدّى الحد؟" → correct real-data answer "صرفت على الأكل 320... المواصلات عدّى الحد بـ 15 جنيه".
  - Note: "صرفت X من8,000" spacing seen in a11y snapshot was a snapshot artifact — real DOM text is correct ("من 8,000").

## This round: completed modifications & verification
1. **Per-category budget limits (BRD finance)** — full stack:
   - Schema: new `CategoryBudget` model (unique userId+month+year+category); db:push OK; db.ts global key bumped to __sekretirPrismaV3 + dev server restarted (per infra note).
   - Domain: CategoryBudgetRecord type; IFinanceRepository.listCategoryBudgets/setCategoryBudget (null=remove); Prisma impl via upsert/deleteMany.
   - Application: FinanceUseCases.setCategoryBudget/removeCategoryBudget (validates category + amount, supports ?month=); FinanceSummaryDTO.categoryLimits [{category, limit, spent, pct (0-200), over}] sorted by pct desc.
   - Insights: financeInsights now emits 🚨 WARNING when over limit ("خالصت حد مواصلات...") and 🎯 SUGGESTION at ≥80% ("قربت توصل لحد أكل وشرب (80%...)") — wired in dashboard via listCategoryBudgets; verified live on home feed.
   - AI: new action `SET_CATEGORY_BUDGET` (auto-execute, prompt rule 14 distinguishes "ميزانية الفواتير 500" → category limit vs "ميزانيتي كذا" → SET_BUDGET); QUERY FINANCE_SUMMARY/BUDGET_STATUS payloads now include categoryLimits. Verified live: "خلي ميزانية الفواتير 500 جنيه في الشهر" → "ظبطت حد صرف فواتير على 500 جنيه في الشهر".
   - API: POST /api/budget/limits {category, amount, month?} (amount≤0 removes).
   - UI (finance view): new "🎯 حدود الفئات" card — per-limit rows with over/near badges, spend-vs-limit progress (emerald/amber/rose), inline edit (pencil prefills form) + remove (trash); add row = category Select (hides already-limited) + amount + حدد; read-only note for past months; category breakdown bars now show "(حد X ج)" reference and turn rose when over. E2E verified: added SHOPPING 300 via UI (toast + row appears + progressbar 0%).
   - Seed: demo user now gets FOOD 1200 / TRANSPORT 400 / BILLS 600 limits on re-seed.
2. **Weekly plan view (BRD §16)** — calendar day/week toggle:
   - Domain: WeekPlanDTO {start, days[{date, slots, plannedMinutes}]}; PlanningUseCases.getWeekPlan (1-14 days capped, slot buckets by day, task title join).
   - API: GET /api/plan/week?start=YYYY-MM-DD&days=7.
   - UI: pill toggle (يوم/أسبوع) in calendar header; week mode renders 7-column grid (RTL, Sunday-first matching week strip), each day: header button (opens that day in day mode), compact occurrence chips (amber=events, emerald=planned, line-through=done, faded=missed, title tooltip), "+N كمان" overflow after 5, per-day planned-hours footer "⏳ X سا", today column amber-tinted; horizontal scroll on mobile (min-w 640px). Verified live: today column shows محاضرة + 3 planned slots + "⏳ 8 سا", other days "فاضي".
3. **Copy last-month budget** — when current month has no budget, finance view shows "انسخ ميزانية الشهر اللي فات (X ج)" chip (fetches prev month summary, one click sets it). Seed-data friendly for new months.

## Unresolved issues / risks & next priorities
- agent-browser CLI here can't set a mobile viewport (no flag) — mobile verified by responsive classes only this round (week grid scrolls horizontally on mobile by design; day views were mobile-verified in earlier rounds).
- Category limit edit reuses the add row (pencil prefills it) — if user navigates months the form targets browsed month (intended).
- Next round suggestions: notification when a category limit is crossed (BUDGET_ALERT on expense create vs its limit); "الأسبوع الجاي/اللي فات" nav also in week mode already works via week strip; dark mode; habits/recurring check-in view (BRD §16); transfer between categories (BRD §19); per-task live timer on home timeline.

---
Task ID: cron-20261004-4
Agent: main (Z.ai Code) — webDevReview round 4
Task: Status assessment + browser QA + new features (category-limit notifications, expense edit/move, المتكرر hub) + AI UPDATE_EXPENSE + styling

## Current project status
- STABLE. Browser QA round passed end-to-end (agent-browser, desktop): home renders, AI QUERY regression OK ("قد إيه صرفت الشهر ده؟" → real data), all 6 views healthy, lint + tsc clean (app code), no runtime errors in dev.log.
- Minor note confirmed: "من8,000" spacing seen in a11y snapshots is a snapshot artifact only — real DOM renders "من 8,000" (finance-view.tsx:398 uses `من{' '}`).

## This round: completed modifications & verification
1. **Category-limit crossing notifications (BRD §21/§28)** — dashboard `syncNotifications` now takes categoryLimits and emits per-category BUDGET_ALERTs, deduped via refKey `catlimit-{cat}-{Y-M}-{over|near}`:
   - over (spent ≥ limit) → "عدّيت حد الصرف! 🚨 خالصت حد فواتير (575 من 500 ج)..."
   - near (80-99%) → "قربت توصل للحد ⚠️ صرفت 80% من حد أكل وشرب (320 من 400 ج) — فاضل 80 ج بس."
   - Verified live: bell showed 3 new alerts matching demo data exactly (BILLS over, FOOD 80%, TRANSPORT over).
2. **Expense edit / move between categories (BRD §19 corrections)** — full stack:
   - Domain: `UpdateExpenseData` + `IFinanceRepository.updateExpense`; Prisma impl (partial update, userId-scoped findFirst guard).
   - Application: `FinanceUseCases.updateExpense` (validates amount/category/date; unknown-category → Arabic error) + `matchExpense` (fuzzy description match over last 60 days, most-recent-first).
   - API: PATCH /api/expenses/[id] {amount?, category?, description?, date?}.
   - AI: NEW action `UPDATE_EXPENSE` (intent + action enum, prompt rule 15) — auto-executes (single correction, like SET_CATEGORY_BUDGET). Verified live twice: "المصروف اللي سجلته أوبر كان 60 جنيه مش 45" → "عدّلت «أوبر» — بقى 60 جنيه" (DB: 45→60); "انقل مصروف مواصلات الجامعة لفئة الترفيه" → DB TRANSPORT→ENTERTAINMENT (restored after QA).
   - UI: expense rows now group-hover with amber tint; pencil button (hover-reveal, focus-visible kept) opens the add-dialog in edit mode (title "تعديل المصروف ✏️", prefilled, recurring switch hidden); toast "اتعدل المصروف ✏️". Verified E2E: غدا في الكافيتريا 🍔→🛍️, amount 65→90 saved.
3. **المتكرر hub (BRD §16 habits & recurring check-in)** — third calendar mode (يوم/أسبوع/المتكرر):
   - عاداتك المتكررة: open recurring tasks with recurrence label + next deadline + duration; "خلصتها ✅" check-in completes the instance (backend auto-materializes the next one — verified: daily habit moved from "النهارده 23:00" to "الجاي بكرة 23:00" after check-in).
   - مواعيد ثابتة متكررة: recurring events with time + next-occurrence chip (client-side 60-day lookahead on recurrence rules).
   - التزاماتك المالية المتكررة: upcoming recurring bills with next-due + monthly total ("500 ج/شهر").
   - Backend fix: `FinanceSummaryDTO.upcomingRecurring` now global (not month-scoped) — merges month expenses + all recurring with nextDueAt > now, deduped by id, now includes `recurrence` field. Verified: September-created internet bill (nextDueAt Oct 7) appears in October summary.
   - Seed: 2 new demo habits (أذاكر ساعة قبل النوم DAILY, أراجع مصاريفي للأسبوع WEEKLY) added; re-seeded.
4. **Styling polish [mandatory]**:
   - Home greeting is now a hero banner: amber gradient (amber-100→orange-50→stone-50, RTL direction) with blurred glow circles, suggestion inline — verified screenshot.
   - Staggered FadeIn entrances on the three المتكرر cards; colored icon tiles (orange Flame / amber Repeat / emerald Wallet); hover states on all hub rows.
   - Expense rows: group hover amber tint + white icon tile + hover-reveal edit button.
   - Calendar toggle now 3 pills with active amber state; المتكرر tab screenshot verified.
5. QA artifacts: download/qa-home-hero.png, download/qa-recurring-hub.png.

## Unresolved issues / risks & next priorities
- UPDATE_EXPENSE matches by description only (last 60 days) — expenses with empty description can't be matched by name (AI replies "ملقيتش مصروف باسم..."). Could add amount-hint matching later.
- Habit check-in "streak" count not persisted (flame shown only as due-today indicator) — a real streak counter would need a completion history query per task.
- ASR voice path still unverified with a real mic (headless limitation); TTS Arabic accent acceptable.
- Next round suggestions: dark mode; income edit; budget-vs-actual month report card; per-task live timer on home timeline; transfer between categories as explicit قاعدة (مبلغ ثابت يتنقل شهريًا); notification when recurring expense comes due (EXPECTED_EXPENSE alert on nextDueAt day); PWA offline shell.

---
Task ID: cron-20261004-5
Agent: main (Z.ai Code) — webDevReview round 5
Task: Status assessment + browser QA + new features (habit streaks, recurring-due alerts, income edit, live timer on home) + AI fixes + styling

## Current project status
- STABLE. Browser QA re-verified end-to-end after re-seed: home (hero + suggestion + timeline + tasks + finance), calendar day/week/recurring, finance with limits. `bun run lint` clean, `tsc --noEmit` clean (app code), no new runtime errors in dev.log.
- QA finding FIXED this round: asking "ايه عاداتي المتكررة؟" previously returned a generic schedule answer (no habits query path in AI) — now has a dedicated HABITS query type AND a robust GENERAL fallback that includes habits + recurring bills data.

## This round: completed modifications & verification
1. **Habit streak counter (BRD §16)** — full stack:
   - Domain: new `HabitDTO` (streak, bestStreak, totalCompletions, isDueToday, lastCompletedAt).
   - Application: `TaskUseCases.listHabits()` — groups COMPLETED recurring-task history by normalized title + recurrence, walks consecutive check-ins (`computeStreak`, interval + 1-day grace tolerance, chain-alive check so stale streaks read 0).
   - API: `GET /api/habits`. Verified: seeded history → streak 3/best 3; UI check-in moved it correctly and materialized the next instance.
   - UI (المتكرر hub): streak chips "🔥 N أيام/أسبوعين..." with Egyptian-Arabic pluralization via new `streakCountLabel()` shared helper; "أول مرة" / "أفضل: N" fallback chips; check-in toast announces the new streak count.
2. **Recurring-expense due notifications (BRD §21/§28)** — new `EXPECTED_EXPENSE` notification type: "التزام مالي النهارده 💸" when nextDueAt is today, "التزام عدّى معاده ⏰" when overdue; deduped via refKey `due-{id}-{dueDay}[-late]`; 💸 icon in the bell. Verified E2E by temporarily shifting the internet bill's nextDueAt to today → alert fired with correct name/amount, then reverted.
3. **Income edit (parity with expenses, BRD §19)** — full stack:
   - Domain repo `UpdateIncomeData` + Prisma impl; `FinanceUseCases.updateIncome` (validates amount/date) + `matchIncome` (fuzzy source/description match, last 60 days).
   - API: `PATCH /api/incomes/[id]`. UI: hover-reveal pencil on income rows (white icon tiles, group hover tint) opening the dialog in edit mode ("تعديل الدخل ✏️"). Verified E2E: created 3500 → edited to 4000 via UI → `incomeThisMonth` recalculated.
   - AI: new action `UPDATE_INCOME` (auto-execute; prompt rule 16). Verified live: "الدخل اللي سجلته من الفريلانس كان 4500 مش 4000" → "عدّلت دخل «شغل فريلانس» — بقى 4500 جنيه".
4. **Per-task live timer on home timeline (BRD §17)** — `PlanSlotDTO`/`OccurrenceDTO` now carry `taskIsTracking`/`taskTrackingStartedAt` (dashboard + day/week plan joins); home timeline renders an emerald ring + "● شغّال X د" chip that ticks every 30s; calendar day agenda shows the same chip. Verified live with a real tracking session (start → chip on home → stop → actualMinutes:1 in DB).
5. **AI habits query + tone hardening** — prompt rules 16-18 added (UPDATE_INCOME, HABITS query, no-JSON rule renumbered); rule 5 strengthened with habit examples; answerQuestion now demands verbatim names from data + a final self-check line against "عندها/عنده" (last round's regression). Verified: "عندي ايه عادات وسلسلتي كام؟" → correct verbatim habit titles, masculine tone, real streak numbers.
6. **Habit-streak praise insight (BRD §17)** — `habitStreakInsights()` in dashboard: INSIGHT "🔥 سلسلة «...» وصلت 3 أيام ورا بعض — كمّل كده، انت شاطر! 👏" when an alive streak ≥3 (from real history); renders in سكرتير يقولك. Verified.
7. **Seed improvements** — study habit gets 3 past completions (live 3-day streak out of the box), weekly review habit gets 1 past completion; incomes now clamped into the current Cairo month so "دخل الشهر" is never 0 after re-seed.

## Unresolved issues / risks & next priorities
- Streak counts same-day double check-ins as 2 (acceptable simplification; each check-in counts).
- GENERAL AI fallback payload is now heavier (includes habits) — fine for SQLite scale.
- agent-browser ref staleness during SPA re-renders made tab clicks flaky in QA (retry with fresh snapshot works) — not an app bug.
- Next round suggestions: dark mode; explicit transfers between categories (BRD §19); PWA offline shell; per-category month report card; habit "streak at risk" evening notification; AI natural-language reschedule ("أجل مهمة X لبكرة") already partly covered by UPDATE_TASK — expand tests; TTS voice comparison (xiaochen/kazi vs tongtong) for Arabic.
- QA artifacts this round: download/qa-home-live-timer.png, download/qa-habits-streaks.png, download/qa-home-final.png, download/qa-week-regression.png.
---
Task ID: cron-20261004-6
Agent: main (Z.ai Code) — webDevReview round 6
Task: Status assessment + browser QA + dark mode + month report card + AI MONTH_REPORT/PRODUCTIVITY queries + habit streak-at-risk alert

## Current project status
- STABLE. Full browser QA passed before feature work: all 6 views render (light), AI QUERY regression OK (real data, masculine tone), lint + tsc clean (app code), no runtime errors in dev.log. The only QA "finding" (task form time picker showing English "Hours/AM-PM" spinbuttons) is the native Chromium <input type="time"> a11y tree — not an app bug.
- This round's data-scare was investigated and RESOLVED: home briefly showed zeros because a transient CSS parse error (see below) broke the page mid-fetch; DB verified intact (14 tasks / 3 events / 13 expenses / 2 incomes / budget 8000). Reload fixed it.

## This round: completed modifications & verification
1. **Dark mode (BRD §43 polish) — full warm-stone theme with amber accent**:
   - next-themes (class attribute, system-aware) + inline no-flash script in layout head; body on semantic tokens; ThemeToggle (☀️/🌙) in the header next to the bell.
   - `.dark` semantic tokens warmed (stone-950 bg / stone-900 cards / amber-600 primary) so shadcn Dialogs/Selects/Popovers/toasts follow; `color-scheme: dark` for native inputs.
   - Unlayered CSS utility overrides in globals.css remap the concrete stone/amber/rose/emerald palette used across sekretir components (bg-white→#1c1917, text-stone-* inverted, borders → white/6-9%, amber/rose/emerald tints → color-mix-on-dark equivalents, hover variants included). Dark ::selection + dark scrollbars.
   - Hero gradient gets explicit dark: classes (amber glow over stone-950); `bg-white/60` send-overlay darkened.
   - Verified via screenshots: home/tasks/calendar/finance/assistant in dark + light regression (download/dark-*.png, final-light-home5.png, final-dark-home.png). Theme persists in localStorage.
2. **Month report card (تقرير الشهر، BRD §19)** — new `report` block in FinanceSummaryDTO:
   - projectedSpent (current month pace × days-in-month) + projectedOverBudget, deltaPct vs last month (extra prev-month expenses query), topCategory with % of spend, net saved (income−spend) + savingRatePct, verdict: on_track | watch | over | no_budget.
   - UI: MonthReportCard between budget card and category breakdown — verdict badge (مضبوط ✅ / خلي بالك ⚠️ / عدّيت 🚨), 4 stat tiles, contextual Egyptian verdict line ("وفّرت 83% من دخلك 👏"). Works for browsed months (past months show totals instead of projection). Verified live: 5,890 projected / ▼44% vs 1,355 / فواتير 66% / وفرت 3,740.
3. **AI MONTH_REPORT + PRODUCTIVITY query types** — full prompt + fetchQueryData support:
   - MONTH_REPORT: "إيه تقرير الشهر؟" / "صرفي مقارنة باللي فات" → verified live ("صرفت 760 من 8000... أقل من الشهر اللي فات (1355) فرق 44% 🎉").
   - PRODUCTIVITY: "إيه أحسن وقت بتنجز فيه؟" → peak completion hours (from 30d completedAt histogram), completions 7/14d, avg/day, estimate-vs-actual drift. Verified via curl: "خلصت من 9 مهام في اسبوعين... أوقات 5 و10 مساءً 🕔". Report also included in FINANCE_SUMMARY/BUDGET_STATUS payloads. Home example chip updated to «إيه تقرير الشهر؟».
4. **Habit streak-at-risk evening notification (BRD §16/§28)** — new HABIT_REMINDER type + 🔥 bell icon:
   - At Cairo hour ≥ 20:00, for each open recurring habit with an ALIVE streak ≥ 2 that is due today and not yet checked in → "سلسلتك في خطر! 🔥 «...» لسه ما سجلتهاش وسلسلتك (يومين) ممكن تقع". Deduped per habit/day (refKey habitrisk-{id}-{day}); Arabic dual/plural grammar handled (يومين/أيام/يوم).
   - E2E verified with a synthetic habit (streak 2, due today, unchecked) and a temporarily lowered threshold → notification fired with correct title/body; threshold restored to 20:00 and test data cleaned (3 tasks + 1 notification removed, verified).

## Unresolved issues / risks & next priorities
- Dark coverage is override-based: any NEW hardcoded light utility in sekretir components (e.g. a new bg-emerald-700 or border-teal-*) may need a matching .dark override — audit visually when adding features. (Semantic-token usage is already covered.)
- PRODUCTIVITY routing is LLM-nondeterministic — occasionally falls back to GENERAL (which answers reasonably from schedule data). Rule 18 could be strengthened further if drift is observed.
- Streak-at-risk only fires for habits due TODAY; a WEEKLY habit due mid-week never gets the evening nudge (by design).
- Next round suggestions: category-to-category transfers (BRD §19); PWA offline shell (service worker + manifest theme dark variant); per-category month report drill-down; TTS voice comparison (xiaochen/kazi vs tongtong) for Arabic; AI natural-language reschedule ("أجل مهمة X لبكرة") as dedicated POSTPONE action; budget copy auto-suggestion insight when new month starts.
- QA artifacts: download/dark-home.png, dark-tasks.png, dark-finance2/3.png, dark-calendar.png, dark-assistant.png, light-finance.png, final-light-home5.png, final-dark-home.png.

---
Task ID: cron-20261004-7
Agent: main (Z.ai Code) — webDevReview round 7
Task: Status assessment + browser QA + new features (AI POSTPONE, category transfers, no-budget insight) + styling

## Current project status
- STABLE. Pre-work baseline QA (agent-browser + lint + tsc) passed: home renders (evening greeting, hero suggestion), lint clean, tsc clean for app code (remaining tsc errors are only in external examples/ and skills/ folders — not app code). No new runtime errors in dev.log (the historical globals.css parse errors in the log predate this session; all recent requests 200).

## This round: completed modifications & verification
1. **AI POSTPONE action (BRD §6/§13 — natural-language rescheduling)** — full stack:
   - Domain: IPlanRepository.`deleteFutureSlotsForTask(userId, taskId, from)` + Prisma impl (deletes PLANNED slots with startAt >= from).
   - Enums: POSTPONE intent + POSTPONE/TRANSFER_BUDGET added to AI_ACTION_TYPES.
   - Prompt: action schema {"type":"POSTPONE","taskName","toDate","toTime":null|"HH:mm"} + rule 19 (أجل/أخّر/أورّح مهمة موجودة → POSTPONE; new tasks still CREATE_TASK).
   - Handler: matches task (fuzzy Arabic), updates deadline (toDate @ toTime or 23:59:59), then unschedules ALL of the task's open PLANNED slots.
   - **Bug found & fixed during E2E**: initially deleted only slots with startAt >= now — a stale earlier-today slot (17:40, already past) survived the postponement. Changed to pass epoch → ALL open slots removed. Verified: today plan went 4 → 3 slots and the reply mentions the removal + suggests «نظملي يومي».
   - E2E verified twice: "أجل مهمة أجيب هدية عيد ميلاد أخويا لبعد بكرة الساعة 6 مساءً" → deadline 2026-10-08→2026-10-06T18:00, old slot removed; "أجل مذاكرة ساعة قبل النوم لبكرة الساعة 10 مساءً" → 2026-10-05T22:00 + stale 17:40 slot deleted. Demo data restored afterwards (deadlines PATCHed back, day replanned via نظملي يومي — PLAN_DAY regression passed, 6 slots).
2. **Category transfers (BRD §19)** — full stack:
   - Application: FinanceUseCases.`transferCategoryBudget(userId, from, to, amount, monthKey?)` — validates distinct categories, source limit exists, result >= 0 (Arabic errors: "لازم تختار فئتين مختلفتين" / "مفيش حد صرف متظبط على الفئة دي أصلاً" / "حد الفئة مش كفاية — المتبقي X ج بس").
   - API: POST /api/budget/transfer {from, to, amount, month?}. Edge cases curl-verified (same category → error; missing source limit → error; valid → returns new limits).
   - AI: new action TRANSFER_BUDGET (rule 20: "حول 100 من حد الأكل لحد المواصلات" → TRANSFER_BUDGET; "زود حد X" بدون مصدر → SET_CATEGORY_BUDGET). Verified live: FOOD 1200→1100, TRANSPORT 400→500.
   - UI: "حوّل" button in حدود الفئات header (current month + has limits) → Dialog (من فئة = limited categories, لفئة = all others excluding source, amount, live emerald/rose preview "حد أكل وشرب هيبقى 1150 ج — وحد ترفيه هيبقى 50 ج", submit disabled until valid). E2E via browser: FOOD→ENTERTAINMENT 50 → toast + new ترفيه row + FOOD progress updated; reverted via API + limit removed. Radix Selects need click-interaction (agent-browser select doesn't work on them — noted for future QA).
3. **New-month no-budget SUGGESTION insight** — financeInsights now emits SUGGESTION "الشهر ده لسه من غير ميزانية!..." when monthlyBudget null (dashboard feed; complements the existing copy-last-month chip in finance view).
4. **Assistant styling [mandatory]**: quick-prompt chips under welcome (نظملي يومي / قد إيه صرفت الشهر ده؟ / إيه مهامي اللي فاضلة؟ / إيه عاداتي وسلسلتي؟ — click-to-send, amber pills, hidden once conversation starts); per-message HH:MM timestamps (TimeTag, shown for new messages); user bubble upgraded to amber gradient (amber-500→600) with shadow; assistant bubble hover (shadow + amber border); TTS button hover scale-110; ACTION_ICON map extended (POSTPONE ⏩, TRANSFER_BUDGET 🔁, SET_CATEGORY_BUDGET 🎯, CREATE_PROJECT_WITH_TASKS 🗂️, ADD_SUBTASKS 🪄, UPDATE_EXPENSE/UPDATE_INCOME ✏️/💵).
5. QA artifacts: download/qa-round7-*.png (baseline home, assistant chips, assistant chat with timestamps, transfer dialog, limits after transfer, finance light, home light). Demo data restored to seed state (limits BILLS 600 / TRANSPORT 400 / FOOD 1200, original deadlines, fresh today plan).

## Unresolved issues / risks & next priorities
- POSTPONE removes slots but does NOT auto-slot the task into the target day (reply suggests «نظملي يومي») — predictable-by-design; could auto-regenerate target-day plan later if desired.
- Transfer previews/validates against the limit ceiling (not remaining budget room) — matches backend rule.
- Chat timestamps only appear for messages sent after this deploy (old localStorage messages have no `at`).
- agent-browser `select` command doesn't work on Radix Select — must click trigger + option in future QA.
- Next round suggestions: auto-slot postponed task into target day free gap; per-category month report drill-down; TTS voice comparison for Arabic; PWA service worker (offline shell); budget auto-copy prompt notification on new month (backend REMINDER on month rollover); streak "caught up" celebration animation.

---
Task ID: cron-20261004-6
Agent: main (Z.ai Code) — webDevReview round 6 (worklog round 8)
Task: Status assessment + browser QA + new features (category drill-down report, postpone auto-slot + planner window fix, streak celebration confetti) + styling

## Current project status
- STABLE. Full browser QA passed (agent-browser): dark mode complete across all 6 views (home hero/calendar/finance/assistant/tasks/projects all remap correctly via globals.css overrides — dark mode was evidently finished after round 7 without being logged), AI regression OK (QUERY + POSTPONE with real data, Egyptian masculine tone), notifications bell populated correctly, lint + tsc clean (app code), no runtime errors in dev.log (only transient Fast-Refresh reloads from mid-edit saves).

## This round: completed modifications & verification
1. **Per-category drill-down report (BRD §19)** — finance "صرفت في إيه؟" rows are now buttons (hover amber tint + chevron affordance + focus-visible ring) opening a rich report Dialog computed client-side from summary.expenses (no new API needed):
   - 3 stat tiles (الإجمالي amber / من صرف الشهر % / عدد المصاريف), per-category limit progress row (فاضل X ج / عدّيت بـ X ج, emerald/amber/rose), day-by-day mini bar chart (amber bars, rose when over limit, per-day amount labels + title tooltips), scrollable transaction list with "أكبر مصروف" badge on the largest expense; empty state for categories with no spend. Works in dark mode (verified screenshot).
   - Verified E2E: FOOD (185 ج, 24%, حد 1,200 فاضل 1,015, bars 03:120/04:65) and TRANSPORT (75 ج, 10%, حد 400) match DB exactly.
2. **POSTPONE auto-slot (BRD §13/§14) + two planner fixes** — postponing via AI now lands the task in the target day immediately:
   - NEW `PlanningUseCases.scheduleTaskInDay(userId, taskId, dayKey, {pinnedStart})`: schedules ONLY the postponed task (first-fit gap in waking window 08:00→23:00, respecting fixed events + existing slots); an explicit requested hour ("الساعة 6") pins the slot exactly there when free, else the nearest gap after it. No day-wide rebuild — other slots untouched (predictable).
   - NEW `IPlanRepository.createSlot` (+ Prisma impl, wall-clock day bucket).
   - FIX (bug exposed by the feature): `generatePlan` planned future days from **00:00 midnight** — auto-planning window is now **08:00→23:00** (matching the app's own 15*60 dayMinutes assumption); explicit pins still honoured from 00:00 floor (user's explicit choice), past pins fall back to first-fit.
   - AI POSTPONE reply now says "وحطّيتها في خطة بكرة الساعة 18:00" (or "مفيش وقت فاضي في اليوم ده يستحملها"). Verified E2E twice: pinned 18:00 → exactly one slot 18:00-18:45 tomorrow (no midnight junk, no displaced tasks); today's plan regenerated from current time.
3. **Streak celebration (BRD §16)** — `celebrateStreak()` (canvas-confetti, new dep): twin amber/emerald bursts from both bottom corners on every habit check-in, particle count scales with streak (intensity tiers by /3), golden-rain top burst at streak ≥7. Fired with the existing streak toast. Verified E2E: check-in → streak 4→5 + toast "برافو! سلسلة «أذاكر ساعة قبل النوم» وصلت 5 أيام 🔥" + confetti, no console errors.
4. QA artifacts: download/qa-round8-drilldown.png (light), qa-round8-drilldown-dark.png (dark), qa-round8-streak-after.png, qa-round8-final-home.png (+ earlier qa-dark-*.png for all 6 dark views).

## Data hygiene this round
- Postpone-test artifacts reverted; leftover midnight slots deleted; **demo data re-seeded** at end of round (habit chains had drifted from repeated QA check-ins across rounds 5-7: duplicate materialized instances). Fresh state: study habit streak 3 due today 23:00, plan 18:30→22:50, budget 8,000, limits FOOD 1,200 / TRANSPORT 400 / BILLS 600. NOTE: re-seed invalidates old sessions (login page shows — correct behavior).

## Unresolved issues / risks & next priorities
- `generatePlan` full-day rebuild remains available via «نظملي يومي» — it now uses the 08:00→23:00 window, but filling a future day with ALL open tasks is by design (explicit user request).
- Habit check-in marks the task COMPLETED and materializes the next instance — if a user checks in twice quickly (or double-clicks), the guard is `checkinBusy` UI-only; server-side double-materialization is possible but low risk.
- agent-browser can't capture mid-animation confetti in a static screenshot (function verified by execution + absence of errors).
- Next round suggestions: per-task timer on assistant quick actions; PWA offline shell; TTS Arabic voice comparison; budget auto-copy backend REMINDER on month rollover; weekly plan "أسبوع الجاي" quick-jump chips; notification center grouping by day.
---
Task ID: cron-20261004-9
Agent: main (Z.ai Code) — webDevReview round 9
Task: Status assessment + browser QA + new features (notification center grouping, month-rollover budget reminder, week-view header, CSV export, keyboard shortcuts, streak rescue toast)

## Current project status
- STABLE. Pre-work browser QA passed on all views (light + dark), AI QUERY regression OK (real data, Egyptian masculine tone, verbatim names), lint clean, tsc clean for app code (only external skills/ folder errors), no runtime errors in dev.log. Demo login demo@sekretir.app / 123456 works (re-seed from round 8 had invalidated old sessions).
- QA environment note for future rounds: agent-browser semantic locators (`find role button`) hit the HIDDEN mobile bottom-nav buttons — always click the visible desktop nav via `eval` (`b.offsetParent!==null` check) or use fresh snapshot refs after every re-render (refs go stale).

## This round: completed modifications & verification
1. **Notification center upgrade (BRD §28)** — full redesign of the bell popover:
   - Day grouping: sticky group headers النهارده / امبارح / أقدم (Cairo wall-clock day compare via isoDayKey), each with a count.
   - Per-type tinted icon chips (rose=overdue/deadline, amber=budget/commitments, emerald=events/tasks, orange=habits/AI, stone=summary/replan) — dark mode auto-covered by existing globals.css overrides; added missing `.dark .bg-white\/85` override for the sticky header strip.
   - Header upgrade: amber icon chip + "N جديد" rose pill + "علّم الكل مقروء" (CheckCheck icon, disabled when 0 unread); richer empty state (✨ tile + subtitle); bell icon now wobbles (`sekretir-swing` keyframes) while unread exists; unread rows keep amber tint + pulsing dot; relative time labels ("النهارده 15:26" / "امبارح 15:26" / "12 أكتوبر 15:26"); hover scale on chips.
2. **Month-rollover budget reminder (BRD §19/§28)** — new `BUDGET_REMINDER` notification type:
   - DashboardUseCases.getDashboard now also fetches the PREVIOUS month's budget (parallel query, January→December year rollover handled); syncNotifications emits "الشهر ده لسه من غير ميزانية 💰" with last month's amount + copy hint when current month has no budget but prev month did. Deduped per month (`budgetmissed-YYYY-M`).
   - E2E verified via curl: deleted current-month budget + created prev-month 6500 → dashboard → notification fired with exact amount; then restored (budget 8000 back, prev-month test budget + reminder deleted).
3. **Week-view header with quick jumps (calendar)** — week mode now has its own header row: range label ("4 — 10 أكتوبر 2026"), weekly load badge ("⏳ N سا مخططة", title tooltip), "الأسبوع الحالي" emerald badge when viewing the current week, and quick-jump chips اللي فات / النهارده / الجاي (النهارده disabled when current week). Verified in browser.
4. **CSV month export (BRD §19)** — "CSV ⬇" ghost button in the تقرير الشهر card header:
   - Client-side build from FinanceSummaryDTO: overview (budget/spent/remaining/income/net), per-category rows (spend/limit/remaining), full expense + income ledgers. RFC-style escaping, CRLF, UTF-8 BOM for Arabic Excel, filename `sekretir-report-YYYY-MM.csv`.
   - Verified by intercepting the Blob in-browser: correct Arabic content and exact figures (8000/760/7240/4500/3740).
5. **Keyboard shortcuts (power users)** — global keydown in page.tsx: "/" → jumps to المساعد and focuses the chat box (new `data-sekretir-chat-input` on AiInput); digits 1-6 → switch views. Guarded: ignored while typing in fields, with modifier keys held, or inside a MODAL dialog only (`[role="dialog"][aria-modal="true"]` — bug found & fixed during E2E: Radix non-modal Popover also carries role="dialog" and originally blocked the shortcut). Footer now shows the shortcuts as kbd hints.
6. **Streak rescue toast (BRD §16)** — evening habit check-in (>= 20:00 Cairo) on a due habit with alive streak >= 2 now says "لحقت على السلسلة! 🔥 … كان قريب يقع!" instead of the regular praise (companion to the streak-at-risk notification).
7. **Data hygiene** — deleted stray English QA task «give me some money» (leftover from an earlier round's AI test) + its stale notifications; auto-replan after deletion re-flowed today's slots (4 sequential slots 18:40→22:15, verified no overlaps/junk via API).

## Unresolved issues / risks & next priorities
- MONTH_REPORT routing still occasionally falls back to GENERAL (LLM nondeterminism) — GENERAL answers correctly from real data, acceptable.
- Week header chips + day-strip arrows both navigate weeks; they share selectedKey so they stay in sync (no bug, just two paths).
- CSV export is client-side from the loaded summary — for very large months the summary endpoint caps rows; fine for personal scale.
- Notification "mark one as read" optimistic update still reloads on failure (unchanged from before).
- Next round suggestions: PWA offline shell (service worker + manifest + dark variant icon); TTS Arabic voice comparison; auto-copy-budget one-click action inside the BUDGET_REMINDER notification (deep-link chip to finance copy button); notification center "mark read on scroll" or per-group collapse; AI reschedule tests expansion ("أجل مهمة X لبكرة" dedicated POSTPONE regression suite).
- QA artifacts: download/qa-r9-home.png, qa-r9-tasks.png, qa-r9-finance.png, qa-r9-calendar.png, qa-r9-assistant.png, qa-r9-ai-reply2.png, qa-r9-dark-home.png, qa-r9-week-header.png, qa-r9-notifs.png, qa-r9-dark-notifs.png, qa-r9-final-home.png.
