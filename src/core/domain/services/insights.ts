import type { InsightDTO } from '../types';
import type { ExpenseCategory } from '../enums';
import { CATEGORY_LABELS_AR } from '../enums';

// ============================================================
// Smart insights & warnings (BRD §23, §24) — deterministic rules
// over real user data snapshots. The AI never invents these.
// ============================================================

export interface FinanceSnapshot {
  monthlyBudget: number | null;
  monthSpent: number;
  spentToday: number;
  avgDailySpend: number; // last 14 days average
  expectedRecurringRestOfMonth: number;
  dayOfMonth: number;
  daysInMonth: number;
  incomeThisMonth: number;
  /** User-set per-category limits vs actual spend. */
  categoryLimits?: { category: ExpenseCategory; limit: number; spent: number; pct: number; over: boolean }[];
}

export interface TaskSnapshot {
  overdue: { id: string; title: string }[];
  dueWithin24h: { id: string; title: string }[];
  dueTodayCount: number;
  completedToday: number;
  activeTotal: number;
}

export interface PlanningSnapshot {
  freeMinutesToday: number;
  unplannedImportant: { id: string; title: string }[];
}

export interface CalendarSnapshot {
  nextEvent: { title: string; minutesUntil: number } | null;
}

let insightCounter = 0;
function makeInsight(
  kind: InsightDTO['kind'],
  domain: InsightDTO['domain'],
  icon: string,
  text: string
): InsightDTO {
  insightCounter += 1;
  return { id: `ins_${insightCounter}_${Date.now()}`, kind, domain, icon, text };
}

function pct(diff: number, base: number): number {
  if (base <= 0) return 0;
  return Math.round((diff / base) * 100);
}

export function financeInsights(s: FinanceSnapshot): InsightDTO[] {
  const out: InsightDTO[] = [];

  // New month without a budget → nudge to set one (BRD §19/§17).
  if (!s.monthlyBudget || s.monthlyBudget <= 0) {
    out.push(
      makeInsight(
        'SUGGESTION',
        'FINANCE',
        '💰',
        'الشهر ده لسه من غير ميزانية! ظبط ميزانية من صفحة الفلوس — أو انسخ بتاعة الشهر اللي فات بضغطة واحدة.'
      )
    );
  }

  if (s.spentToday > 0 && s.avgDailySpend > 0) {
    const diffPct = pct(s.spentToday - s.avgDailySpend, s.avgDailySpend);
    if (Math.abs(diffPct) >= 25) {
      out.push(
        makeInsight(
          'INSIGHT',
          'FINANCE',
          '💰',
          diffPct > 0
            ? `صرفك النهارده (${Math.round(s.spentToday)} ج) أعلى من متوسطك اليومي (${Math.round(s.avgDailySpend)} ج) بحوالي ${diffPct}%.`
            : `صرفك النهارده (${Math.round(s.spentToday)} ج) أقل من متوسطك اليومي (${Math.round(s.avgDailySpend)} ج) بحوالي ${Math.abs(diffPct)}%. كمل كده 👌`
        )
      );
    }
  }

  if (s.monthlyBudget && s.monthlyBudget > 0 && s.dayOfMonth > 0) {
    const projected = (s.monthSpent / s.dayOfMonth) * s.daysInMonth;
    if (projected > s.monthlyBudget) {
      const overrunDays = Math.max(1, Math.round(((projected - s.monthlyBudget) / (s.monthSpent / s.dayOfMonth))));
      out.push(
        makeInsight(
          'WARNING',
          'FINANCE',
          '⚠️',
          `لو فضلت بتصرف بالمعدل ده، ممكن الميزانية (${Math.round(s.monthlyBudget)} ج) تخلص قبل آخر الشهر بحوالي ${overrunDays} يوم.`
        )
      );
      out.push(makeInsight('SUGGESTION', 'FINANCE', '💭', 'تحب أعملك خطة صرف لباقي الشهر؟'));
    } else if (s.monthSpent / s.monthlyBudget >= 0.8 && s.dayOfMonth / s.daysInMonth < 0.8) {
      out.push(
        makeInsight(
          'WARNING',
          'FINANCE',
          '⚠️',
          `صرفت ${Math.round((s.monthSpent / s.monthlyBudget) * 100)}% من ميزانية الشهر وإحنا لسه في يوم ${s.dayOfMonth}.`
        )
      );
    }
  }

  const remaining = s.monthlyBudget ? s.monthlyBudget - s.monthSpent : null;
  if (remaining !== null && s.expectedRecurringRestOfMonth > remaining && s.expectedRecurringRestOfMonth > 0) {
    out.push(
      makeInsight(
        'IMPORTANT',
        'FINANCE',
        '❗',
        `المصاريف المتوقعة الجاية (${Math.round(s.expectedRecurringRestOfMonth)} ج) أكبر من المبلغ المتبقي في ميزانيتك (${Math.round(remaining)} ج).`
      )
    );
  }

  if (s.incomeThisMonth > 0 && s.monthSpent > s.incomeThisMonth) {
    out.push(
      makeInsight('WARNING', 'FINANCE', '📉', `صرفك الشهر ده (${Math.round(s.monthSpent)} ج) عدّى دخلك (${Math.round(s.incomeThisMonth)} ج).`)
    );
  }

  // Per-category limit warnings (BRD finance): over limit → WARNING, near limit → SUGGESTION.
  for (const cl of s.categoryLimits ?? []) {
    const label = CATEGORY_LABELS_AR[cl.category] ?? cl.category;
    if (cl.over) {
      out.push(
        makeInsight(
          'WARNING',
          'FINANCE',
          '🚨',
          `خالصت حد ${label} اللي حددته (${Math.round(cl.spent)} من ${Math.round(cl.limit)} ج) — ممكن تظبطه أو تقلل صرفك فيه.`
        )
      );
    } else if (cl.pct >= 80) {
      out.push(
        makeInsight(
          'SUGGESTION',
          'FINANCE',
          '🎯',
          `قربت توصل لحد ${label} (${cl.pct}% — ${Math.round(cl.spent)} من ${Math.round(cl.limit)} ج). خلي بالك من باقي الشهر.`
        )
      );
    }
  }

  return out;
}

export function taskInsights(s: TaskSnapshot): InsightDTO[] {
  const out: InsightDTO[] = [];
  if (s.overdue.length > 0) {
    const top = s.overdue[0];
    out.push(
      makeInsight(
        'WARNING',
        'TASKS',
        '⏰',
        `عندك ${s.overdue.length} ${s.overdue.length === 1 ? 'مهمة متأخرة' : 'مهام متأخرة'}${s.overdue.length > 1 ? ` — أهمها «${top.title}»` : ` («${top.title}»)`}. تحب نرتبهم تاني؟`
      )
    );
  }
  if (s.dueWithin24h.length > 0) {
    out.push(
      makeInsight(
        'IMPORTANT',
        'TASKS',
        '❗',
        `«${s.dueWithin24h[0].title}» آخر موعد ليها خلال 24 ساعة.`
      )
    );
  }
  if (s.completedToday >= 3) {
    out.push(makeInsight('INSIGHT', 'TASKS', '💪', `شغل حلو! خلصت ${s.completedToday} مهام النهارده.`));
  }
  if (s.activeTotal === 0) {
    out.push(makeInsight('INSIGHT', 'TASKS', '🎉', 'مفيش مهام مفتوحة — يوم فاضي! عايز تضيف حاجة؟'));
  }
  return out;
}

export function planningInsights(s: PlanningSnapshot): InsightDTO[] {
  const out: InsightDTO[] = [];
  if (s.freeMinutesToday >= 60 && s.unplannedImportant.length > 0) {
    const hours = Math.floor(s.freeMinutesToday / 60);
    out.push(
      makeInsight(
        'SUGGESTION',
        'PLANNING',
        '🤖',
        `عندك ${hours} ${hours === 1 ? 'ساعة فاضية' : 'ساعات فاضية'} النهارده — ممكن نستغلهم في «${s.unplannedImportant[0].title}».`
      )
    );
  }
  return out;
}

export function calendarInsights(s: CalendarSnapshot): InsightDTO[] {
  const out: InsightDTO[] = [];
  if (s.nextEvent && s.nextEvent.minutesUntil <= 60 && s.nextEvent.minutesUntil >= 0) {
    const m = s.nextEvent.minutesUntil;
    out.push(
      makeInsight(
        'IMPORTANT',
        'CALENDAR',
        '📅',
        m <= 1 ? `عندك «${s.nextEvent.title}» دلوقتي.` : `عندك «${s.nextEvent.title}» بعد ${m} دقيقة.`
      )
    );
  }
  return out;
}

// ============================================================
// Personalization (BRD §17) — learned patterns from REAL
// completion history only (no invention).
// ============================================================

export interface PersonalizationSnapshot {
  completedByHour: number[]; // 24 buckets, completions by hour-of-day (last 30 days)
  completedLast7: number;
  completedLast14: number;
  chronicOverdue: { id: string; title: string; daysLate: number }[]; // open tasks > 2 days late
  /** Completed tasks (last 30d) with BOTH an estimate and real tracked time. */
  durationSamples: { title: string; estimatedMinutes: number; actualMinutes: number }[];
}

function hourRangeArabic(hour: number): string {
  const start = hour;
  const end = (hour + 2) % 24;
  const dayPart = start < 12 ? 'الصبح' : start < 17 ? 'الضهر' : start < 21 ? 'العصر بالليل' : 'بالليل';
  return `بين ${start} و${end} ${dayPart}`;
}

export function personalizationInsights(s: PersonalizationSnapshot): InsightDTO[] {
  const out: InsightDTO[] = [];

  const totalCompletions = s.completedByHour.reduce((a, b) => a + b, 0);
  if (totalCompletions >= 5) {
    let peak = 0;
    for (let h = 1; h < 24; h += 1) {
      if (s.completedByHour[h] > s.completedByHour[peak]) peak = h;
    }
    out.push(
      makeInsight(
        'INSIGHT',
        'PLANNING',
        '🧠',
        `لاحظت إنك بتنجز أكتر ${hourRangeArabic(peak)} — بحاول أحط المهام المهمة لك هناك.`
      )
    );
  }

  if (s.completedLast14 > 0) {
    const avg = Math.round((s.completedLast14 / 14) * 10) / 10;
    out.push(
      makeInsight(
        'INSIGHT',
        'TASKS',
        '📈',
        `بتخلص في المتوسط ${avg} ${avg === 1 ? 'مهمة' : 'مهام'} في اليوم (آخر أسبوعين).`
      )
    );
  }

  if (s.chronicOverdue.length >= 2) {
    out.push(
      makeInsight(
        'WARNING',
        'TASKS',
        '🐢',
        `في ${s.chronicOverdue.length} مهام بتتأجل باستمرار (منها «${s.chronicOverdue[0].title}» متأخرة ${s.chronicOverdue[0].daysLate} يوم). تحب نقسمها لخطوات أصغر؟`
      )
    );
  }

  if (s.completedLast7 >= 5 && s.chronicOverdue.length === 0) {
    out.push(
      makeInsight('INSIGHT', 'TASKS', '🔥', `أسبوع نار — خلصت ${s.completedLast7} مهام آخر 7 أيام من غير ما حاجة تتأخر!`)
    );
  }

  // Duration calibration (BRD §17): comparing real tracked time vs estimates.
  if (s.durationSamples.length >= 3) {
    const totalEstimated = s.durationSamples.reduce((sum, d) => sum + d.estimatedMinutes, 0);
    const totalActual = s.durationSamples.reduce((sum, d) => sum + d.actualMinutes, 0);
    if (totalEstimated > 0) {
      const ratio = totalActual / totalEstimated;
      const driftPct = Math.round(Math.abs(ratio - 1) * 100);
      if (ratio >= 1.3) {
        out.push(
          makeInsight(
            'WARNING',
            'PLANNING',
            '⏳',
            `لاحظت إن شغلك الفعلي بياخد أكتر من تقديراتك بحوالي ${driftPct}% — هزوّد تقديرات مهامك الجاية عشان الخطة تبقى أقرب للواقع.`
          )
        );
      } else if (ratio <= 0.7) {
        out.push(
          makeInsight(
            'INSIGHT',
            'PLANNING',
            '⚡',
            `بتخلص أسرع من تقديراتك بحوالي ${driftPct}% — ممكن نحط مهام أكتر في يومك من غير ضغط.`
          )
        );
      }
    }
    // Single-task outlier: real time dwarfed the estimate (≥2x and ≥45 min).
    const outlier = s.durationSamples.find(
      (d) => d.actualMinutes >= d.estimatedMinutes * 2 && d.actualMinutes >= 45
    );
    if (outlier) {
      out.push(
        makeInsight(
          'INSIGHT',
          'TASKS',
          '🔍',
          `«${outlier.title}» خدت ${fmtDurationArabic(outlier.actualMinutes)} بدل ${fmtDurationArabic(outlier.estimatedMinutes)} المتوقعة — القسمة لخطوات هتخلي التقدير أدق.`
        )
      );
    }
  }

  return out;
}

function fmtDurationArabic(minutes: number): string {
  if (minutes < 60) return `${minutes} دقيقة`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} ${h === 1 ? 'ساعة' : 'ساعات'}`;
  return `${h} سا ${m} د`;
}
