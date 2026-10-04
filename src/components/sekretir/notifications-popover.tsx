'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { apiErrorMessage, endpoints, type NotificationDTO } from '@/lib/sekretir/api';
import { cn } from '@/lib/utils';
import { fmtTime, relativeDay } from '@/lib/sekretir/date-utils';

const NOTIF_ICON: Record<string, string> = {
  OVERDUE_TASK: '⏰',
  DEADLINE_WARNING: '❗',
  BUDGET_ALERT: '💰',
  EVENT_REMINDER: '📅',
  TASK_REMINDER: '✅',
  WEEKLY_SUMMARY: '📊',
  AI_SUGGESTION: '🤖',
  REPLAN: '🔄',
};

interface NotificationsBellProps {
  refreshKey: number;
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
          className="relative text-stone-600 hover:text-amber-700 hover:bg-amber-50"
          aria-label={`التنبيهات${unread > 0 ? ` (${unread} جديد)` : ''}`}
        >
          <Bell className="size-5" />
          {unread > 0 ? (
            <span className="absolute -top-0.5 -left-0.5 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0 rounded-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
          <h3 className="font-bold text-sm text-stone-800">التنبيهات</h3>
          {unread > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-50"
              onClick={markAll}
            >
              علّم الكل مقروء
            </Button>
          ) : null}
        </div>
        <ScrollArea className="max-h-80">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-stone-400">بنجيب التنبيهات...</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-stone-400">
              مفيش تنبيهات لسه — كل حاجة تمام ✨
            </div>
          ) : (
            <ul className="divide-y divide-stone-50">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => markOne(n)}
                    className={cn(
                      'w-full text-right px-4 py-3 flex gap-3 items-start hover:bg-stone-50 transition-colors',
                      !n.isRead && 'bg-amber-50/60'
                    )}
                  >
                    <span className="text-lg leading-none mt-0.5 shrink-0" aria-hidden>
                      {NOTIF_ICON[n.type] ?? '🔔'}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-stone-800">{n.title}</span>
                      <span className="block text-xs text-stone-500 mt-0.5">{n.body}</span>
                      <span className="block text-[10px] text-stone-400 mt-1">
                        {relativeDay(n.createdAt)} {fmtTime(n.createdAt)}
                      </span>
                    </span>
                    {!n.isRead ? (
                      <span className="size-2 rounded-full bg-amber-500 mt-1.5 shrink-0" aria-hidden />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
