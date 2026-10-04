'use client';

import {
  BotMessageSquare,
  CalendarDays,
  CheckSquare2,
  FolderKanban,
  Home,
  LogOut,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NotificationsBell } from '@/components/sekretir/notifications-popover';
import { apiErrorMessage, endpoints, type UserDTO } from '@/lib/sekretir/api';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export type SekretirView = 'home' | 'assistant' | 'tasks' | 'projects' | 'calendar' | 'finance';

const NAV_ITEMS: { id: SekretirView; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'الرئيسية', icon: Home },
  { id: 'assistant', label: 'المساعد', icon: BotMessageSquare },
  { id: 'tasks', label: 'المهام', icon: CheckSquare2 },
  { id: 'projects', label: 'المشاريع', icon: FolderKanban },
  { id: 'calendar', label: 'التقويم', icon: CalendarDays },
  { id: 'finance', label: 'الفلوس', icon: Wallet },
];

interface AppShellProps {
  user: UserDTO;
  view: SekretirView;
  onNavigate: (v: SekretirView) => void;
  onLogout: () => void;
  refreshKey: number;
  children: React.ReactNode;
}

export function AppShell({ user, view, onNavigate, onLogout, refreshKey, children }: AppShellProps) {
  async function handleLogout() {
    try {
      await endpoints.logout();
      onLogout();
    } catch (e) {
      toast.error(apiErrorMessage(e));
      onLogout();
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2 shrink-0"
            aria-label="سكرتير — الرئيسية"
          >
            <img
              src="/logo.png"
              alt="لوجو سكرتير"
              className="w-9 h-9 rounded-full object-cover ring-1 ring-stone-200"
            />
            <span className="font-extrabold text-lg text-stone-900">سكرتير</span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 mx-auto" aria-label="التنقل الرئيسي">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors',
                    active
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-stone-600 hover:text-amber-700 hover:bg-amber-50'
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-1 mr-auto md:mr-0 md:ms-auto">
            <span className="hidden sm:block text-sm font-semibold text-stone-700 max-w-28 truncate">
              {user.name}
            </span>
            <NotificationsBell refreshKey={refreshKey} />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="text-stone-500 hover:text-rose-600 hover:bg-rose-50"
              aria-label="تسجيل خروج"
            >
              <LogOut className="size-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 pt-4 pb-24 md:pb-8">{children}</main>

      {/* Footer (desktop only) */}
      <footer className="mt-auto hidden md:block border-t border-stone-200 bg-white">
        <p className="py-4 text-center text-sm text-stone-400">
          سكرتير — مساعدك الشخصي الذكي 🤖
        </p>
      </footer>

      {/* Mobile bottom nav */}
      <nav
        className="sekretir-bottom-nav fixed bottom-0 inset-x-0 z-40 bg-white border-t border-stone-200 md:hidden"
        aria-label="التنقل السفلي"
      >
        <div className="grid grid-cols-6">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 py-2 min-h-[44px] text-[10px] font-semibold transition-colors',
                  active ? 'text-amber-700' : 'text-stone-400'
                )}
              >
                <Icon className={cn('size-5', active && 'text-amber-600')} />
                {item.label}
                {active ? (
                  <span className="absolute top-0 w-8 h-0.5 rounded-full bg-amber-600" aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
