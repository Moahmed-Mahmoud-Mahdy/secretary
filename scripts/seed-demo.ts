import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// ============================================================
// Demo data seeder — creates a demo account so the app can be
// tried instantly: demo@sekretir.app / 123456
// Run: bun scripts/seed-demo.ts
// ============================================================

const db = new PrismaClient();

function wall(dayOffsetFromToday: number, hh = 0, mm = 0): Date {
  const now = new Date();
  // Cairo wall clock encoded as UTC
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const base = Date.UTC(get('year'), get('month') - 1, get('day'), hh, mm, 0, 0);
  return new Date(base + dayOffsetFromToday * 86_400_000);
}

async function main() {
  const email = 'demo@sekretir.app';
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Demo user already exists — refreshing demo data...');
    await db.user.delete({ where: { id: existing.id } });
  }

  const passwordHash = await bcrypt.hash('123456', 10);
  const user = await db.user.create({
    data: { name: 'مهدي', email, passwordHash, monthlyBudget: 8000 },
  });

  // ---------- projects ----------
  const pos = await db.project.create({
    data: {
      userId: user.id,
      name: 'مشروع POS',
      description: 'نظام كاشير لمطعم صغير — Next.js + قاعدة بيانات',
      status: 'ACTIVE',
      priority: 'HIGH',
      deadline: wall(5, 23, 59),
    },
  });

  const graduation = await db.project.create({
    data: {
      userId: user.id,
      name: 'مشروع التخرج',
      description: 'موقع التخرج — تحليل وتصميم وتنفيذ',
      status: 'ACTIVE',
      priority: 'URGENT',
      deadline: wall(20, 23, 59),
    },
  });

  // ---------- tasks ----------
  const t1 = await db.task.create({
    data: {
      userId: user.id,
      title: 'أخلص شاشة الكاشير في مشروع POS',
      description: 'واجهة البيع + ربط الداتابيز',
      priority: 'HIGH',
      estimatedMinutes: 120,
      deadline: wall(0, 22, 0),
      projectId: pos.id,
      tags: 'كود,واجهات',
    },
  });
  await db.task.create({
    data: {
      userId: user.id,
      title: 'أذاكر Algorithms — Graphs',
      priority: 'URGENT',
      estimatedMinutes: 120,
      deadline: wall(1, 20, 0),
      tags: 'مذاكرة',
    },
  });
  await db.task.create({
    data: {
      userId: user.id,
      title: 'أكتب فصل التحليل لمشروع التخرج',
      priority: 'HIGH',
      estimatedMinutes: 90,
      deadline: wall(2, 23, 59),
      projectId: graduation.id,
    },
  });
  await db.task.create({
    data: {
      userId: user.id,
      title: 'أدفع فاتورة النت',
      priority: 'MEDIUM',
      estimatedMinutes: 15,
      deadline: wall(1, 23, 59),
      recurrence: 'MONTHLY',
    },
  });
  const overdue = await db.task.create({
    data: {
      userId: user.id,
      title: 'أرد على إيميل الدكتور',
      priority: 'MEDIUM',
      estimatedMinutes: 15,
      deadline: wall(-2, 17, 0),
    },
  });
  void overdue;
  await db.task.create({
    data: {
      userId: user.id,
      title: 'أجيب هدية عيد ميلاد أخويا',
      priority: 'LOW',
      estimatedMinutes: 45,
      deadline: wall(4, 22, 0),
    },
  });
  await db.task.create({
    data: {
      userId: user.id,
      title: 'مراجعة كود مشروع التخرج',
      status: 'COMPLETED',
      completedAt: wall(0, 11, 30),
      projectId: graduation.id,
      estimatedMinutes: 60,
    },
  });

  // ---------- events ----------
  await db.calendarEvent.create({
    data: {
      userId: user.id,
      title: 'محاضرة Networking',
      eventType: 'FIXED',
      startAt: wall(0, 10, 0),
      endAt: wall(0, 12, 0),
      recurrence: 'WEEKLY',
      notes: 'قاعة 204',
    },
  });
  await db.calendarEvent.create({
    data: {
      userId: user.id,
      title: 'سيكشن Algorithms',
      eventType: 'FIXED',
      startAt: wall(1, 13, 0),
      endAt: wall(1, 15, 0),
    },
  });
  await db.calendarEvent.create({
    data: {
      userId: user.id,
      title: 'ميعاد الدكتور — مناقشة مشروع التخرج',
      eventType: 'FIXED',
      startAt: wall(2, 12, 30),
      endAt: wall(2, 13, 30),
    },
  });

  // ---------- expenses ----------
  const expenseData: { amount: number; category: string; description: string; dayOffset: number }[] = [
    { amount: 30, category: 'TRANSPORT', description: 'مواصلات الجامعة', dayOffset: 0 },
    { amount: 65, category: 'FOOD', description: 'غدا في الكافيتريا', dayOffset: 0 },
    { amount: 45, category: 'TRANSPORT', description: 'أوبر', dayOffset: -1 },
    { amount: 120, category: 'FOOD', description: 'سوبر ماركت', dayOffset: -1 },
    { amount: 500, category: 'BILLS', description: 'إنترنت المنزل', dayOffset: -3 },
    { amount: 80, category: 'ENTERTAINMENT', description: 'سينما مع الصحاب', dayOffset: -4 },
    { amount: 250, category: 'SHOPPING', description: 'تيشيرتات', dayOffset: -5 },
    { amount: 60, category: 'FOOD', description: 'فطار', dayOffset: -6 },
    { amount: 40, category: 'TRANSPORT', description: 'مترو', dayOffset: -6 },
    { amount: 300, category: 'EDUCATION', description: 'كورس أونلاين', dayOffset: -8 },
    { amount: 90, category: 'FOOD', description: 'مطعم', dayOffset: -9 },
    { amount: 35, category: 'TRANSPORT', description: 'مواصلات', dayOffset: -10 },
  ];
  for (const e of expenseData) {
    await db.expense.create({
      data: {
        userId: user.id,
        amount: e.amount,
        category: e.category,
        description: e.description,
        date: wall(e.dayOffset, 12, 0),
      },
    });
  }

  // recurring / expected expense
  await db.expense.create({
    data: {
      userId: user.id,
      amount: 500,
      category: 'BILLS',
      description: 'إنترنت المنزل (شهري)',
      date: wall(-27, 12, 0),
      isRecurring: true,
      recurrence: 'MONTHLY',
      nextDueAt: wall(3, 12, 0),
    },
  });

  // ---------- income ----------
  await db.income.create({
    data: { userId: user.id, amount: 3000, source: 'مصروف الأهل', date: wall(-14, 12, 0) },
  });
  await db.income.create({
    data: { userId: user.id, amount: 1500, source: 'شغل فريلانس صغير', date: wall(-6, 12, 0) },
  });

  // ---------- budget ----------
  const now = new Date();
  const cairoMonth = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit' })
      .format(now)
      .split('-')[1]
  );
  await db.budget.create({
    data: { userId: user.id, month: cairoMonth, year: new Date().getFullYear(), amount: 8000 },
  });

  // ---------- per-category limits (showcase) ----------
  const catLimits: [string, number][] = [
    ['FOOD', 1200],
    ['TRANSPORT', 400],
    ['BILLS', 600],
  ];
  for (const [category, amount] of catLimits) {
    await db.categoryBudget.create({
      data: { userId: user.id, month: cairoMonth, year: new Date().getFullYear(), category, amount },
    });
  }

  // ---------- plan slots (today) ----------
  await db.planSlot.create({
    data: {
      userId: user.id,
      taskId: t1.id,
      date: wall(0, 0, 0),
      startAt: wall(0, 17, 0),
      endAt: wall(0, 19, 0),
      status: 'PLANNED',
    },
  });

  console.log('✅ Demo data seeded: demo@sekretir.app / 123456');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
