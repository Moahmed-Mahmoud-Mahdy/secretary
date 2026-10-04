'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { AppShell, type SekretirView } from '@/components/sekretir/app-shell';
import { AuthScreen } from '@/components/sekretir/auth-screen';
import { HomeView } from '@/components/sekretir/home-view';
import { AssistantView } from '@/components/sekretir/assistant-view';
import { TasksView } from '@/components/sekretir/tasks-view';
import { ProjectsView } from '@/components/sekretir/projects-view';
import { CalendarView } from '@/components/sekretir/calendar-view';
import { FinanceView } from '@/components/sekretir/finance-view';
import { endpoints, isAuthError, type UserDTO } from '@/lib/sekretir/api';
import { CHAT_STORAGE_KEY } from '@/lib/sekretir/constants';

export default function Page() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<UserDTO | null>(null);
  const [view, setView] = useState<SekretirView>('home');
  const [refreshKey, setRefreshKey] = useState(0);
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);

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
    >
      {view === 'home' ? (
        <HomeView refreshKey={refreshKey} onSendToAI={handleSendToAI} onNavigate={setView} />
      ) : null}
      {view === 'assistant' ? (
        <AssistantView
          queuedMessage={queuedMessage}
          onQueuedConsumed={() => setQueuedMessage(null)}
          onExecutedChange={bumpRefresh}
        />
      ) : null}
      {view === 'tasks' ? <TasksView refreshKey={refreshKey} onAuthError={handleLogout} /> : null}
      {view === 'projects' ? (
        <ProjectsView refreshKey={refreshKey} onAuthError={handleLogout} />
      ) : null}
      {view === 'calendar' ? (
        <CalendarView refreshKey={refreshKey} onAuthError={handleLogout} />
      ) : null}
      {view === 'finance' ? (
        <FinanceView refreshKey={refreshKey} onAuthError={handleLogout} />
      ) : null}
    </AppShell>
  );
}
