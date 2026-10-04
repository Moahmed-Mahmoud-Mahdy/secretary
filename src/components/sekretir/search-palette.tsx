'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckSquare2,
  FolderKanban,
  Loader2,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  endpoints,
  SEARCH_EMPTY,
  apiErrorMessage,
  type SearchResultsDTO,
} from '@/lib/sekretir/api';
import { CATEGORY_META } from '@/lib/sekretir/constants';
import { fmtTime, isoDayKey, relativeDay, relativeDayFromKey } from '@/lib/sekretir/date-utils';
import { PRIORITY_META } from '@/lib/sekretir/constants';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ============================================================
// بحث سريع — global command palette (⌘K / Ctrl+K).
// Searches tasks / projects / events / expenses / incomes with
// Arabic-normalized matching (hamza / taa marbuta tolerant).
// ============================================================

export interface SearchNavigation {
  view: 'tasks' | 'projects' | 'calendar' | 'finance';
  focusDate?: string; // calendar deep-link (event)
  focusMonth?: string; // finance deep-link (expense/income "YYYY-MM")
}

interface SearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (nav: SearchNavigation) => void;
}

type FlatHit =
  | { kind: 'task'; id: string; title: string; sub: string; overdue: boolean; project: string | null; priority: string }
  | { kind: 'project'; id: string; title: string; sub: string; progress: number }
  | { kind: 'event'; id: string; title: string; sub: string; date: string }
  | { kind: 'expense'; id: string; title: string; sub: string; amount: number; category: string }
  | { kind: 'income'; id: string; title: string; sub: string; amount: number };

export function SearchPalette({ open, onOpenChange, onNavigate }: SearchPaletteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultsDTO>(SEARCH_EMPTY);
  const [searching, setSearching] = useState(false);
  const [dirty, setDirty] = useState(false);
  const seqRef = useRef(0);

  // Debounced search — 250ms.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(SEARCH_EMPTY);
      setSearching(false);
      setDirty(false);
      return;
    }
    setSearching(true);
    setDirty(true);
    const seq = ++seqRef.current;
    const t = window.setTimeout(async () => {
      try {
        const data = await endpoints.search(q);
        if (seqRef.current === seq) {
          setResults(data);
          setSearching(false);
        }
      } catch (e) {
        if (seqRef.current === seq) {
          setSearching(false);
          toast.error(apiErrorMessage(e));
        }
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [query]);

  const reset = useCallback(() => {
    setQuery('');
    setResults(SEARCH_EMPTY);
    setDirty(false);
  }, []);

  const hits = useMemo<FlatHit[]>(() => {
    const out: FlatHit[] = [];
    for (const t of results.tasks) {
      out.push({
        kind: 'task',
        id: t.id,
        title: t.title,
        sub: `مهمة${t.projectName ? ` • ${t.projectName}` : ''}`,
        overdue: t.isOverdue,
        project: t.projectName,
        priority: t.priority,
      });
    }
    for (const p of results.projects) {
      out.push({ kind: 'project', id: p.id, title: p.name, sub: `مشروع • ${p.tasksCount} مهام`, progress: p.progress });
    }
    for (const e of results.events) {
      out.push({
        kind: 'event',
        id: e.id,
        title: e.title,
        sub: `حدث • ${relativeDay(e.startAt)} ${fmtTime(e.startAt)}`,
        date: isoDayKey(e.startAt),
      });
    }
    for (const e of results.expenses) {
      out.push({
        kind: 'expense',
        id: e.id,
        title: e.description || 'مصروف',
        sub: `مصروف • ${relativeDayFromKey(e.date)}`,
        amount: e.amount,
        category: e.category,
      });
    }
    for (const i of results.incomes) {
      out.push({ kind: 'income', id: i.id, title: i.source || 'دخل', sub: `دخل • ${relativeDayFromKey(i.date)}`, amount: i.amount });
    }
    return out;
  }, [results]);

  const pick = (hit: FlatHit) => {
    switch (hit.kind) {
      case 'task':
        onNavigate({ view: 'tasks' });
        break;
      case 'project':
        onNavigate({ view: 'projects' });
        break;
      case 'event':
        onNavigate({ view: 'calendar', focusDate: hit.date });
        break;
      case 'expense':
      case 'income': {
        // deep-link finance to the item's month
        const dateStr = results.expenses.find((e) => e.id === hit.id)?.date ?? results.incomes.find((i) => i.id === hit.id)?.date ?? '';
        onNavigate({ view: 'finance', focusMonth: dateStr ? dateStr.slice(0, 7) : undefined });
        break;
      }
    }
    reset();
    onOpenChange(false);
  };

  const total = hits.length;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>البحث في سكرتير</DialogTitle>
        <DialogDescription>ابحث في مهامك ومشاريعك وأحداثك وفلوسك</DialogDescription>
      </DialogHeader>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl md:top-[16%] translate-y-0 top-[8%]">
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:text-stone-400 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-bold [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5"
        >
          <div className="relative" dir="rtl">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="ابحث… (مهمة، حدث، مشروع، مصروف)"
              className="text-base"
            />
            {searching ? (
              <Loader2
                className="absolute left-4 top-1/2 -translate-y-1/2 size-4 animate-spin text-amber-600"
                aria-hidden
              />
            ) : null}
          </div>
          <CommandList className="max-h-[52vh]">
            {dirty && !searching && total === 0 ? (
              <CommandEmpty>مفيش نتايج لـ «{query}» — جرب كلمة تانية</CommandEmpty>
            ) : null}
            {!dirty && query.trim().length < 2 ? (
              <div className="px-4 py-6 text-center text-sm text-stone-500">
                <Search className="mx-auto size-6 text-stone-300 mb-2" aria-hidden />
                اكتب حرفين على الأقل — بنبحث في كل حاجة عندك 🔍
              </div>
            ) : null}

        {results.tasks.length > 0 ? (
          <CommandGroup heading={`المهام (${results.tasks.length})`}>
            {hits.filter((h) => h.kind === 'task').map((h) => {
              if (h.kind !== 'task') return null;
              return (
                <CommandItem
                  key={`t-${h.id}`}
                  value={`task ${h.id} ${h.title}`}
                  onSelect={() => pick(h)}
                  className="gap-3 rounded-xl aria-selected:bg-amber-50"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600">
                    <CheckSquare2 className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm font-semibold', h.overdue && 'text-rose-600')}>{h.title}</p>
                    <p className="truncate text-xs text-stone-400">{h.sub}</p>
                  </div>
                  {h.overdue ? (
                    <Badge className="shrink-0 bg-rose-100 text-rose-700 border-0 text-[10px]">متأخرة</Badge>
                  ) : (
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold', PRIORITY_META[h.priority as keyof typeof PRIORITY_META]?.badge ?? '')}>
                      {PRIORITY_META[h.priority as keyof typeof PRIORITY_META]?.label ?? ''}
                    </span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}

        {results.projects.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading={`المشاريع (${results.projects.length})`}>
              {hits.filter((h) => h.kind === 'project').map((h) => {
                if (h.kind !== 'project') return null;
                return (
                  <CommandItem
                    key={`p-${h.id}`}
                    value={`project ${h.id} ${h.title}`}
                    onSelect={() => pick(h)}
                    className="gap-3 rounded-xl aria-selected:bg-amber-50"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                      <FolderKanban className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{h.title}</p>
                      <p className="truncate text-xs text-stone-400">{h.sub}</p>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-amber-700">{h.progress}%</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        ) : null}

        {results.events.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading={`الأحداث (${results.events.length})`}>
              {hits.filter((h) => h.kind === 'event').map((h) => {
                if (h.kind !== 'event') return null;
                return (
                  <CommandItem
                    key={`e-${h.id}`}
                    value={`event ${h.id} ${h.title}`}
                    onSelect={() => pick(h)}
                    className="gap-3 rounded-xl aria-selected:bg-amber-50"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
                      <CalendarDays className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{h.title}</p>
                      <p className="truncate text-xs text-stone-400">{h.sub}</p>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        ) : null}

        {results.expenses.length > 0 || results.incomes.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="الفلوس">
              {hits.filter((h) => h.kind === 'expense').map((h) => {
                if (h.kind !== 'expense') return null;
                const meta = CATEGORY_META[h.category as keyof typeof CATEGORY_META];
                return (
                  <CommandItem
                    key={`x-${h.id}`}
                    value={`expense ${h.id} ${h.title}`}
                    onSelect={() => pick(h)}
                    className="gap-3 rounded-xl aria-selected:bg-amber-50"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 text-sm">
                      {meta?.icon ?? '💸'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{h.title}</p>
                      <p className="truncate text-xs text-stone-400">{h.sub}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-rose-600">-{h.amount} ج</span>
                  </CommandItem>
                );
              })}
              {hits.filter((h) => h.kind === 'income').map((h) => {
                if (h.kind !== 'income') return null;
                return (
                  <CommandItem
                    key={`i-${h.id}`}
                    value={`income ${h.id} ${h.title}`}
                    onSelect={() => pick(h)}
                    className="gap-3 rounded-xl aria-selected:bg-amber-50"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <TrendingUp className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{h.title}</p>
                      <p className="truncate text-xs text-stone-400">{h.sub}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-emerald-600">+{h.amount} ج</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>

      {total > 0 ? (
        <div className="border-t border-stone-100 px-4 py-2 text-[11px] text-stone-400 flex items-center gap-2" dir="rtl">
          <TrendingDown className="size-3 rotate-180" aria-hidden />
          <span>
            {total === 1
              ? 'نتيجة واحدة'
              : total === 2
                ? 'نتيجتين'
                : `${total} نتايج`}{' '}
            — تنقل بالأسهم واختار بـ{' '}
            <kbd className="rounded border border-stone-200 bg-stone-50 px-1">Enter</kbd>
          </span>
        </div>
      ) : null}
        </Command>
      </DialogContent>
    </Dialog>
  );
}
