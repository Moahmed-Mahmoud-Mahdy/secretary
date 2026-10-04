'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';
import { AppShell, type SekretirView } from '@/components/sekretir/app-shell';
import { AuthScreen } from '@/components/sekretir/auth-screen';
import { HomeView } from '@/components/sekretir/home-view';
import { AssistantView } from '@/components/sekretir/assistant-view';
import { TasksView } from '@/components/sekretir/tasks-view';
import { ProjectsView } from '@/components/sekretir/projects-view';
import { CalendarView } from '@/components/sekretir/calendar-view';
import { FinanceView } from '@/components/sekretir/finance-view';
import { SettingsView } from '@/components/sekretir/settings-view';
import { SearchPalette, type SearchNavigation } from '@/components/sekretir/search-palette';
import { endpoints, isAuthError, type UserDTO } from '@/lib/sekretir/api';
import { CHAT_STORAGE_KEY } from '@/lib/sekretir/constants';

export default function Page() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<UserDTO | null>(null);
  const [view, setView] = useState<SekretirView>('home');
  const [refreshKey, setRefreshKey] = useState(0);
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [calendarFocus, setCalendarFocus] = useState<string | null>(null);
  const [financeFocusMonth, setFinanceFocusMonth] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { user: me } = await endpoints.me();
        if (!cancelled) setUser(me);
      } catch (e) {
        if (!cancelled && isAuthError(e)) setUser(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const handleSendToAI = useCallback((message: string) => {
    setQueuedMessage(message);
    setView('assistant');
  }, []);

  const handleLogout = useCallback(() => {
    setUser(null);
    try {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const handleSearchNavigate = useCallback((nav: SearchNavigation) => {
    if (nav.view === 'calendar' && nav.focusDate) setCalendarFocus(nav.focusDate);
    if (nav.view === 'finance' && nav.focusMonth) setFinanceFocusMonth(nav.focusMonth);
    setView(nav.view);
  }, []);

  // Keyboard shortcuts (desktop power users):
  // "/" → jump to المساعد and focus the chat box.
  // ⌘K / Ctrl+K → global search palette.
  // 1..7 → switch between the seven views.
  // Ignored while typing in a field or when a modal dialog is open.
  useEffect(() => {
    if (!user) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
        return;
      }
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      // Only block on *modal* dialogs (Radix Dialog/AlertDialog) — non-modal
      // popovers (bell, selects) also carry role="dialog" but shouldn't trap us.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

      if (e.key === '/') {
        e.preventDefault();
        setView('assistant');
        window.setTimeout(() => {
          document.querySelector<HTMLInputElement>('[data-sekretir-chat-input]')?.focus();
        }, 90);
        return;
      }

      const order: SekretirView[] = [
        'home',
        'assistant',
        'tasks',
        'projects',
        'calendar',
        'finance',
        'settings',
      ];
      const idx = Number(e.key);
      if (idx >= 1 && idx <= order.length) {
        setView(order[idx - 1]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [user]);

  if (booting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 gap-4">
        <div className="relative">
          <img
            src="/logo.png"
            alt="سكرتير"
            className="w-20 h-20 rounded-full object-cover ring-4 ring-amber-100 shadow-md animate-pulse"
          />
          <span className="absolute -bottom-1 -end-1 size-7 rounded-full bg-white border border-stone-200 shadow-sm flex items-center justify-center">
            <Bot className="size-4 text-amber-600" />
          </span>
        </div>
        <p className="text-stone-500 font-semibold">بنجهز سكرتيرك...</p>
        <div className="flex items-center gap-1">
          <span className="sekretir-dot size-2 rounded-full bg-amber-500 inline-block" />
          <span className="sekretir-dot size-2 rounded-full bg-amber-500 inline-block" />
          <span className="sekretir-dot size-2 rounded-full bg-amber-500 inline-block" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthed={setUser} />;
  }

  return (
    <AppShell
      user={user}
      view={view}
      onNavigate={setView}
      onLogout={handleLogout}
      refreshKey={refreshKey}
      onOpenSearch={() => setSearchOpen(true)}
    >
      {/* View transition — keyed remount replays a soft rise on every switch */}
      <motion.div
        key={view}
        initial={{ opacity: 0, y: 14, scale: 0.995 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        {view === 'home' ? (
          <HomeView refreshKey={refreshKey} onSendToAI={handleSendToAI} onNavigate={setView} />
        ) : null}
        {view === 'assistant' ? (
          <AssistantView
            queuedMessage={queuedMessage}
            onQueuedConsumed={() => setQueuedMessage(null)}
            onExecutedChange={bumpRefresh}
            userName={user.name}
          />
        ) : null}
        {view === 'tasks' ? <TasksView refreshKey={refreshKey} onAuthError={handleLogout} /> : null}
        {view === 'projects' ? (
          <ProjectsView refreshKey={refreshKey} onAuthError={handleLogout} />
        ) : null}
        {view === 'calendar' ? (
          <CalendarView
            refreshKey={refreshKey}
            onAuthError={handleLogout}
            focusDate={calendarFocus}
            onFocusDateConsumed={() => setCalendarFocus(null)}
          />
        ) : null}
        {view === 'finance' ? (
          <FinanceView
            refreshKey={refreshKey}
            onAuthError={handleLogout}
            focusMonth={financeFocusMonth}
            onFocusMonthConsumed={() => setFinanceFocusMonth(null)}
          />
        ) : null}
        {view === 'settings' ? (
          <SettingsView user={user} onUserUpdated={setUser} onAuthError={handleLogout} />
        ) : null}
      </motion.div>

      <SearchPalette
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onNavigate={handleSearchNavigate}
      />
    </AppShell>
  );
}
