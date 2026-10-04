'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CalendarClock, Loader2, Moon, Sparkles, Sun, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AiInput } from '@/components/sekretir/ai-input';
import { FadeIn } from '@/components/sekretir/fade-in';
import { SekretirProgress } from '@/components/sekretir/progress';
import {
  apiErrorMessage,
  endpoints,
  isAuthError,
  type DashboardDTO,
} from '@/lib/sekretir/api';
import { fmtMoney } from '@/lib/sekretir/constants';
import { cairoHourNow, fmtTime } from '@/lib/sekretir/date-utils';
import { cn } from '@/lib/utils';
import type { SekretirView } from '@/components/sekretir/app-shell';

const INSIGHT_STYLES: Record<string, string> = {
  INSIGHT: 'border-s-amber-500 bg-amber-50/40',
  WARNING: 'border-s-rose-500 bg-rose-50/40',
  IMPORTANT: 'border-s-rose-700 bg-rose-50',
  SUGGESTION: 'border-s-emerald-500 bg-emerald-50/40',
};

interface HomeViewProps {
  refreshKey: number;
  onSendToAI: (message: string) => void;
  onNavigate: (v: SekretirView) => void;
}

export function HomeView({ refreshKey, onSendToAI, onNavigate }: HomeViewProps) {
  const [data, setData] = useState<DashboardDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await endpoints.dashboard();
      setData(d);
    } catch (e) {
      if (!isAuthError(e)) toast.error(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function sendFromHome(text: string) {
    const message = text.trim();
    if (!message) return;
    setSending(true);
    setInput('');
    try {
      // Hand off to the assistant view — it queues and sends the message.
      onSendToAI(message);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3 rounded-xl" />
        <Skeleton className="h-16 w-full rounded-full" />
        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  const user = data?.user;
  const firstName = user?.firstName ?? user?.name?.split(' ')[0] ?? '';
  const hour = cairoHourNow();
  const isMorning = hour >= 5 && hour < 12;
  const greeting = data?.greeting ?? (isMorning ? 'صباح الخير' : 'مساء الخير');
  const finance = data?.finance;
  const budget = finance?.budget ?? 0;
  const remaining = finance?.remaining ?? 0;
  const spentPct = budget > 0 ? Math.min(100, ((budget - remaining) / budget) * 100) : 0;
  const barColor = spentPct < 60 ? 'bg-emerald-500' : spentPct < 90 ? 'bg-amber-500' : 'bg-rose-500';
  const schedule = [...(data?.schedule ?? [])].sort((a, b) => a.startAt.localeCompare(b.startAt));

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <FadeIn>
      <div className="flex items-center gap-2">
        {isMorning ? (
          <Sun className="size-6 text-amber-500" aria-hidden />
        ) : (
          <Moon className="size-6 text-stone-500" aria-hidden />
        )}
        <h1 className="text-xl sm:text-2xl font-extrabold text-stone-900">
          {greeting} يا {firstName} {isMorning ? '☀️' : '🌙'}
        </h1>
      </div>
      {data?.suggestion ? (
        <p className="text-sm text-stone-500 mt-1">💡 {data.suggestion}</p>
      ) : null}
      </FadeIn>

      {/* AI input */}
      <FadeIn delay={0.05} className="relative">
        <AiInput
          value={input}
          onChange={setInput}
          onSend={sendFromHome}
          disabled={sending}
          placeholder="بتفكر تعمل إيه النهارده؟"
        />
        {sending ? (
          <div className="absolute inset-0 rounded-full bg-white/60 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-amber-600" />
          </div>
        ) : null}
        <p className="text-xs text-stone-400 mt-2 px-2">
          جرب: «دفعت 50 جنيه مواصلات» • «عايز أعمل موقع تخرج» • «نظملي يومي»
        </p>
      </FadeIn>

      {/* Grid */}
      <div className="grid md:grid-cols-2 gap-4 items-start">
        {/* Schedule timeline */}
        <FadeIn delay={0.1}>
        <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-stone-800 flex items-center gap-2">
                <CalendarClock className="size-5 text-amber-600" />
                جدولك النهارده
              </h2>
              {data?.plan ? (
                <span className="text-xs text-stone-400">
                  مخطط {Math.round(data.plan.plannedMinutes / 60)} سا • فاضي{' '}
                  {Math.round(data.plan.freeMinutes / 60)} سا
                </span>
              ) : null}
            </div>
            {schedule.length === 0 ? (
              <div className="py-8 text-center text-sm text-stone-400">
                <p className="text-3xl mb-2" aria-hidden>🗓️</p>
                <p>مفيش حاجة مخططة النهارده</p>
                <p className="mt-1 text-stone-300">قولّي «نظملي يومي» وأنا أرتبك 😄</p>
              </div>
            ) : (
              <ol className="relative space-y-3 ps-4 border-s-2 border-stone-100 sekretir-scroll max-h-96 overflow-y-auto">
                {schedule.map((occ) => {
                  const done = occ.kind === 'PLANNED_TASK' && occ.status === 'DONE';
                  const isEvent = occ.kind === 'EVENT';
                  return (
                    <li key={occ.key} className="relative ps-2">
                      <span
                        className={cn(
                          'absolute -start-[21px] top-2.5 size-2.5 rounded-full ring-2 ring-white',
                          isEvent ? 'bg-amber-500' : done ? 'bg-stone-300' : 'bg-emerald-500'
                        )}
                        aria-hidden
                      />
                      <div
                        className={cn(
                          'flex items-center gap-2 flex-wrap rounded-xl px-3 py-2',
                          isEvent ? 'bg-amber-50 border border-amber-100' : 'bg-stone-50 border border-stone-100'
                        )}
                      >
                        <span className="text-xs font-bold text-stone-500 tabular-nums">
                          {fmtTime(occ.startAt)}
                          {occ.endAt ? ` – ${fmtTime(occ.endAt)}` : ''}
                        </span>
                        <span
                          className={cn(
                            'text-sm font-semibold flex-1',
                            done ? 'line-through text-stone-400' : 'text-stone-800'
                          )}
                        >
                          {occ.title}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full',
                            isEvent ? 'bg-amber-600 text-white' : 'bg-emerald-600 text-white'
                          )}
                        >
                          {isEvent ? '📌 حدث' : '🤖 مهمة'}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
        </FadeIn>

        {/* Right column */}
        <FadeIn delay={0.15} className="space-y-4">
          {/* Task summary */}
          <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-stone-800">مهامك</h2>
                <button
                  type="button"
                  onClick={() => onNavigate('tasks')}
                  className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1"
                >
                  شوف الكل <ArrowLeft className="size-3" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('tasks')}
                  className="rounded-xl bg-rose-50 border border-rose-100 px-2 py-3 text-center hover:bg-rose-100/60 transition-colors"
                >
                  <span className="block text-2xl font-extrabold text-rose-600 tabular-nums">
                    {data?.tasks.overdue.length ?? 0}
                  </span>
                  <span className="text-xs text-rose-700">متأخرة</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('tasks')}
                  className="rounded-xl bg-amber-50 border border-amber-100 px-2 py-3 text-center hover:bg-amber-100/60 transition-colors"
                >
                  <span className="block text-2xl font-extrabold text-amber-600 tabular-nums">
                    {data?.tasks.dueToday.length ?? 0}
                  </span>
                  <span className="text-xs text-amber-700">النهارده</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('tasks')}
                  className="rounded-xl bg-emerald-50 border border-emerald-100 px-2 py-3 text-center hover:bg-emerald-100/60 transition-colors"
                >
                  <span className="block text-2xl font-extrabold text-emerald-600 tabular-nums">
                    {data?.tasks.completedToday ?? 0}
                  </span>
                  <span className="text-xs text-emerald-700">خلصت</span>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Finance mini card */}
          <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-stone-800 flex items-center gap-2">
                  <Wallet className="size-5 text-emerald-600" />
                  الفلوس
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate('finance')}
                  className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1"
                >
                  التفاصيل <ArrowLeft className="size-3" />
                </button>
              </div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm text-stone-500">صرف النهارده:</span>
                <span className="text-xl font-extrabold text-rose-600 tabular-nums">
                  {fmtMoney(finance?.spentToday)} ج
                </span>
              </div>
              {budget > 0 ? (
                <>
                  <p className="text-sm text-stone-500 mt-1">
                    الميزانية: فاضل{' '}
                    <span
                      className={cn(
                        'font-bold tabular-nums',
                        remaining <= 0 ? 'text-rose-600' : 'text-emerald-600'
                      )}
                    >
                      {fmtMoney(remaining)} ج
                    </span>{' '}
                    من {fmtMoney(budget)} ج
                  </p>
                  <SekretirProgress
                    value={spentPct}
                    barClassName={barColor}
                    ariaLabel="نسبة الصرف من الميزانية"
                  />
                </>
              ) : (
                <p className="text-sm text-stone-400 mt-1">
                  لسه محددتش ميزانية الشهر — حددها من صفحة الفلوس 💰
                </p>
              )}
            </CardContent>
          </Card>

          {/* Insights */}
          {data?.insights && data.insights.length > 0 ? (
            <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200">
              <CardContent className="p-4 sm:p-5">
                <h2 className="font-bold text-stone-800 flex items-center gap-2 mb-3">
                  <Sparkles className="size-5 text-amber-600" />
                  سكرتير يقولك
                </h2>
                <ul className="space-y-2 sekretir-scroll max-h-64 overflow-y-auto">
                  {data.insights.map((ins) => (
                    <li
                      key={ins.id}
                      className={cn(
                        'flex items-start gap-2 rounded-xl border border-stone-100 border-s-4 px-3 py-2 text-sm text-stone-700',
                        INSIGHT_STYLES[ins.kind] ?? 'border-s-stone-300'
                      )}
                    >
                      <span aria-hidden className="shrink-0">{ins.icon}</span>
                      <span>{ins.text}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {/* Quick actions */}
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              className="h-auto py-3 flex-col gap-1 border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 rounded-2xl text-xs sm:text-sm"
              onClick={() => sendFromHome('نظملي يوم النهارده')}
            >
              <span className="text-lg" aria-hidden>🪄</span>
              نظملي يومي
            </Button>
            <Button
              variant="outline"
              className="h-auto py-3 flex-col gap-1 border-stone-200 text-stone-600 hover:bg-stone-100 rounded-2xl text-xs sm:text-sm"
              onClick={() => onNavigate('tasks')}
            >
              <span className="text-lg" aria-hidden>✅</span>
              خلصت مهمة
            </Button>
            <Button
              variant="outline"
              className="h-auto py-3 flex-col gap-1 border-stone-200 text-stone-600 hover:bg-stone-100 rounded-2xl text-xs sm:text-sm"
              onClick={() => onNavigate('finance')}
            >
              <span className="text-lg" aria-hidden>💸</span>
              سجلت مصروف
            </Button>
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
