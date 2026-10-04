'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { apiErrorMessage, endpoints, type NotificationDTO } from '@/lib/sekretir/api';
import { cn } from '@/lib/utils';
import { fmtDayMonth, fmtTime, isoDayKey, todayKey } from '@/lib/sekretir/date-utils';

const NOTIF_ICON: Record<string, string> = {
  OVERDUE_TASK: '⏰',
  DEADLINE_WARNING: '❗',
  BUDGET_ALERT: '💰',
  BUDGET_REMINDER: '🪙',
  EXPECTED_EXPENSE: '💸',
  EVENT_REMINDER: '📅',
  TASK_REMINDER: '✅',
  WEEKLY_SUMMARY: '📊',
  AI_SUGGESTION: '🤖',
  REPLAN: '🔄',
  HABIT_REMINDER: '🔥',
};

/** Soft per-type chip tint (auto-remapped by the .dark overrides). */
const NOTIF_CHIP: Record<string, string> = {
  OVERDUE_TASK: 'bg-rose-100 text-rose-700',
  DEADLINE_WARNING: 'bg-rose-100 text-rose-700',
  BUDGET_ALERT: 'bg-amber-100 text-amber-800',
  BUDGET_REMINDER: 'bg-amber-100 text-amber-800',
  EXPECTED_EXPENSE: 'bg-amber-100 text-amber-800',
  EVENT_REMINDER: 'bg-emerald-100 text-emerald-800',
  TASK_REMINDER: 'bg-emerald-100 text-emerald-800',
  WEEKLY_SUMMARY: 'bg-stone-200 text-stone-700',
  AI_SUGGESTION: 'bg-orange-100 text-orange-800',
  REPLAN: 'bg-stone-200 text-stone-700',
  HABIT_REMINDER: 'bg-orange-100 text-orange-800',
};

interface NotificationsBellProps {
  refreshKey: number;
}

interface NotifGroup {
  label: string;
  items: NotificationDTO[];
}

/** Group notifications into اليوم / امبارح / أقدم by Cairo wall-clock day. */
function groupByDay(items: NotificationDTO[]): NotifGroup[] {
  const today = todayKey();
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_399_000).toISOString().slice(0, 10);
  const groups: NotifGroup[] = [
    { label: 'النهارده', items: [] },
    { label: 'امبارح', items: [] },
    { label: 'أقدم', items: [] },
  ];
  for (const n of items) {
    const day = isoDayKey(n.createdAt);
    if (day === today) groups[0].items.push(n);
    else if (day === yesterday) groups[1].items.push(n);
    else groups[2].items.push(n);
  }
  return groups.filter((g) => g.items.length > 0);
}

export function NotificationsBell({ refreshKey }: NotificationsBellProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await endpoints.notifications();
      setItems(data.notifications);
      setUnread(data.unreadCount);
    } catch {
      /* silent for polling */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const groups = useMemo(() => groupByDay(items), [items]);

  async function markAll() {
    try {
      await endpoints.markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnread(0);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  async function markOne(n: NotificationDTO) {
    if (n.isRead) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      await endpoints.markRead(n.id);
    } catch (e) {
      toast.error(apiErrorMessage(e));
      void load();
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setLoading(true);
          void load().finally(() => setLoading(false));
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative text-stone-600 hover:text-amber-700 hover:bg-amber-50 transition-transform',
            unread > 0 && 'hover:scale-105'
          )}
          aria-label={`التنبيهات${unread > 0 ? ` (${unread} جديد)` : ''}`}
        >
          <Bell className={cn('size-5', unread > 0 && 'animate-[sekretir-swing_2.5s_ease-in-out_infinite]')} />
          {unread > 0 ? (
            <span className="absolute -top-0.5 -left-0.5 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 max-w-[calc(100vw-2rem)] p-0 rounded-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-l from-amber-50/80 to-transparent border-b border-stone-100">
          <h3 className="font-bold text-sm text-stone-800 flex items-center gap-2">
            <span className="size-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center" aria-hidden>
              <Bell className="size-3.5" />
            </span>
            التنبيهات
            {unread > 0 ? (
              <span className="rounded-full bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 leading-none tabular-nums">
                {unread} جديد
              </span>
            ) : null}
          </h3>
          {items.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={unread === 0}
              className="h-7 text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-50 disabled:opacity-40 disabled:pointer-events-auto"
              onClick={markAll}
            >
              <CheckCheck className="size-3.5" />
              علّم الكل مقروء
            </Button>
          ) : null}
        </div>
        {/* NOTE: Radix ScrollArea quirk — max-h on the Root alone clips content without ever
            enabling scroll (viewport h-full resolves against auto-height parent). The fix is
            to cap the VIEWPORT itself via the child selector. */}
        <ScrollArea className="max-h-[min(24rem,65vh)] [&>[data-radix-scroll-area-viewport]]:max-h-[min(24rem,65vh)]">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-stone-400">بنجيب التنبيهات...</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="mx-auto size-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-2xl mb-2" aria-hidden>
                ✨
              </div>
              <p className="text-sm font-bold text-stone-700">مفيش تنبيهات — كل حاجة تمام!</p>
              <p className="text-xs text-stone-400 mt-1">هنبعتلك لو حاجة مهمة حصلت</p>
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.label} aria-label={group.label}>
                <p className="sticky top-0 z-10 backdrop-blur bg-white/85 px-4 py-1.5 text-[10px] font-bold text-stone-400 border-b border-stone-50">
                  {group.label}
                  <span className="float-left tabular-nums">{group.items.length}</span>
                </p>
                <ul className="divide-y divide-stone-50">
                  {group.items.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => markOne(n)}
                        className={cn(
                          'w-full text-right px-4 py-3 flex gap-3 items-start hover:bg-stone-50 active:bg-amber-50 transition-colors group',
                          !n.isRead && 'bg-amber-50/60'
                        )}
                      >
                        <span
                          className={cn(
                            'size-8 rounded-xl flex items-center justify-center text-base leading-none shrink-0 transition-transform group-hover:scale-110',
                            NOTIF_CHIP[n.type] ?? 'bg-stone-100 text-stone-600'
                          )}
                          aria-hidden
                        >
                          {NOTIF_ICON[n.type] ?? '🔔'}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-stone-800">{n.title}</span>
                          <span className="block text-xs text-stone-500 mt-0.5 leading-relaxed">{n.body}</span>
                          <span className="block text-[10px] text-stone-400 mt-1 tabular-nums">
                            {group.label === 'النهارده'
                              ? `النهارده ${fmtTime(n.createdAt)}`
                              : group.label === 'امبارح'
                                ? `امبارح ${fmtTime(n.createdAt)}`
                                : `${fmtDayMonth(n.createdAt)} ${fmtTime(n.createdAt)}`}
                          </span>
                        </span>
                        {!n.isRead ? (
                          <span className="size-2 rounded-full bg-amber-500 mt-1.5 shrink-0 animate-pulse" aria-hidden />
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
