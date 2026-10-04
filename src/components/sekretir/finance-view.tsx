'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Repeat,
  Target,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SekretirProgress } from '@/components/sekretir/progress';
import {
  apiErrorMessage,
  endpoints,
  isAuthError,
  type ExpenseCategory,
  type ExpenseDTO,
  type FinanceSummaryDTO,
  type Recurrence,
} from '@/lib/sekretir/api';
import { CATEGORY_META, CATEGORY_OPTIONS, RECURRENCE_OPTIONS, fmtMoney } from '@/lib/sekretir/constants';
import { fmtDayMonth, monthLabel, relativeDay, shiftMonthKey, defaultDateInMonth, todayKey } from '@/lib/sekretir/date-utils';
import { cn } from '@/lib/utils';

type TxTab = 'expenses' | 'incomes';

interface FinanceViewProps {
  refreshKey: number;
  onAuthError: () => void;
}

export function FinanceView({ refreshKey, onAuthError }: FinanceViewProps) {
  const [summary, setSummary] = useState<FinanceSummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TxTab>('expenses');

  // budget inline edit
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);

  // add / edit expense dialog
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseDTO | null>(null);
  const [expForm, setExpForm] = useState({
    amount: '',
    category: 'FOOD' as ExpenseCategory,
    description: '',
    date: '',
    isRecurring: false,
    recurrence: 'none',
  });
  const [addingExpense, setAddingExpense] = useState(false);

  // add income dialog
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [incForm, setIncForm] = useState({ amount: '', source: '', date: '' });
  const [addingIncome, setAddingIncome] = useState(false);

  // per-category limits (BRD finance)
  const [limitForm, setLimitForm] = useState<{ category: string; amount: string }>({ category: '', amount: '' });
  const [savingLimit, setSavingLimit] = useState(false);

  // copy last month's budget shortcut
  const [lastMonthBudget, setLastMonthBudget] = useState(0);
  const [copyingBudget, setCopyingBudget] = useState(false);

  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const currentMonth = todayKey().slice(0, 7);
  const isCurrentMonth = month === currentMonth;
  const isFutureMonth = month > currentMonth;

  const load = useCallback(async () => {
    try {
      const data = await endpoints.financeSummary(month);
      setSummary(data);
    } catch (e) {
      if (isAuthError(e)) {
        onAuthError();
        return;
      }
      toast.error(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [month, onAuthError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Load last month's budget (for the copy shortcut).
  const currentBudget = summary?.budget ?? 0;
  useEffect(() => {
    if (!isCurrentMonth || currentBudget > 0) return;
    let cancelled = false;
    endpoints
      .financeSummary(shiftMonthKey(month, -1))
      .then((s) => {
        if (!cancelled) setLastMonthBudget(s.budget ?? 0);
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, [month, isCurrentMonth, currentBudget]);

  async function copyLastMonthBudget() {
    if (copyingBudget || lastMonthBudget <= 0) return;
    setCopyingBudget(true);
    try {
      await endpoints.setBudget(lastMonthBudget);
      toast.success('اتنسخت ميزانية الشهر اللي فات 💰');
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setCopyingBudget(false);
    }
  }

  const budget = summary?.budget ?? 0;
  const monthSpent = summary?.monthSpent ?? 0;
  const remaining = summary?.remaining ?? 0;
  const spentPct = budget > 0 ? (monthSpent / budget) * 100 : 0;
  const barColor = spentPct < 60 ? 'bg-emerald-500' : spentPct < 90 ? 'bg-amber-500' : 'bg-rose-500';
  const maxCat = Math.max(1, ...(summary?.byCategory ?? []).map((c) => c.total));

  async function saveBudget() {
    const amount = Number(budgetDraft);
    if (!amount || amount <= 0 || savingBudget) return;
    setSavingBudget(true);
    try {
      await endpoints.setBudget(amount);
      setEditingBudget(false);
      toast.success('الميزانية اتحددت 💰');
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setSavingBudget(false);
    }
  }

  async function saveCategoryLimit(categoryRaw?: string, remove = false) {
    const category = categoryRaw ?? limitForm.category;
    if (!category || savingLimit) return;
    const amount = remove ? 0 : Number(limitForm.amount);
    if (!remove && (!amount || amount <= 0)) return;
    setSavingLimit(true);
    try {
      await endpoints.setCategoryLimit(category, amount, month);
      toast.success(remove ? 'اتشال الحد ✅' : 'حد الفئة اتحدد 🎯');
      setLimitForm({ category: '', amount: '' });
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setSavingLimit(false);
    }
  }

  async function saveExpense() {
    const amount = Number(expForm.amount);
    if (!amount || amount <= 0 || addingExpense) return;
    setAddingExpense(true);
    try {
      if (editingExpense) {
        await endpoints.updateExpense(editingExpense.id, {
          amount,
          category: expForm.category,
          description: expForm.description.trim() || null,
          date: expForm.date || todayKey(),
        });
        toast.success('اتعدل المصروف ✏️');
      } else {
        await endpoints.createExpense({
          amount,
          category: expForm.category,
          description: expForm.description.trim() || null,
          date: expForm.date || todayKey(),
          isRecurring: expForm.isRecurring,
          recurrence:
            expForm.isRecurring && expForm.recurrence !== 'none'
              ? (expForm.recurrence as Recurrence)
              : null,
        });
        toast.success('سجلت المصروف 💸');
      }
      setExpenseOpen(false);
      setEditingExpense(null);
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setAddingExpense(false);
    }
  }

  function openEditExpense(x: ExpenseDTO) {
    setEditingExpense(x);
    setExpForm({
      amount: String(x.amount),
      category: x.category,
      description: x.description ?? '',
      date: x.date.slice(0, 10),
      isRecurring: false,
      recurrence: 'none',
    });
    setExpenseOpen(true);
  }

  async function addIncome() {
    const amount = Number(incForm.amount);
    if (!amount || amount <= 0 || addingIncome) return;
    setAddingIncome(true);
    try {
      await endpoints.createIncome({
        amount,
        source: incForm.source.trim() || null,
        date: incForm.date || todayKey(),
      });
      setIncomeOpen(false);
      toast.success('سجلت الدخل 💵');
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setAddingIncome(false);
    }
  }

  async function deleteExpense(id: string) {
    try {
      await endpoints.deleteExpense(id);
      setSummary((prev) =>
        prev
          ? {
              ...prev,
              expenses: prev.expenses.filter((x) => x.id !== id),
            }
          : prev
      );
      toast.success('اتمسح ✅');
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  async function deleteIncome(id: string) {
    try {
      await endpoints.deleteIncome(id);
      setSummary((prev) => (prev ? { ...prev, incomes: prev.incomes.filter((x) => x.id !== id) } : prev));
      toast.success('اتمسح ✅');
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-extrabold text-stone-900">الفلوس</h1>
          {/* Month navigation (right = back in time, matching calendar) */}
          <div className="flex items-center gap-0.5 rounded-full border border-stone-200 bg-white px-1 py-0.5">
            <button
              type="button"
              onClick={() => setMonth(shiftMonthKey(month, -1))}
              className="p-1 rounded-full text-stone-500 hover:bg-amber-50 hover:text-amber-700 transition-colors"
              aria-label="الشهر اللي فات"
            >
              <ChevronRight className="size-4" />
            </button>
            <span className="text-xs font-bold text-stone-700 tabular-nums min-w-[88px] text-center">
              {monthLabel(month)}
            </span>
            <button
              type="button"
              onClick={() => setMonth(shiftMonthKey(month, 1))}
              disabled={isFutureMonth}
              className="p-1 rounded-full text-stone-500 hover:bg-amber-50 hover:text-amber-700 transition-colors disabled:opacity-30 disabled:pointer-events-none"
              aria-label="الشهر الجاي"
            >
              <ChevronLeft className="size-4" />
            </button>
          </div>
          {!isCurrentMonth ? (
            <button
              type="button"
              onClick={() => setMonth(currentMonth)}
              className="text-[11px] font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-full px-2.5 py-1 transition-colors"
            >
              رجوع لحدود النهارده
            </button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 rounded-full"
            onClick={() => {
              setIncForm({ amount: '', source: '', date: defaultDateInMonth(month) });
              setIncomeOpen(true);
            }}
          >
            <ArrowUpCircle className="size-4" />
            ضيف دخل
          </Button>
        </div>
      </div>

      {/* Budget card */}
      <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 sekretir-rise">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-stone-800 flex items-center gap-2">
              <Wallet className="size-5 text-amber-600" />
              ميزانية {monthLabel(month)}
            </h2>
            {editingBudget ? (
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0}
                  dir="ltr"
                  value={budgetDraft}
                  onChange={(e) => setBudgetDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveBudget();
                  }}
                  className="h-8 w-28 text-sm"
                  aria-label="الميزانية الجديدة"
                  autoFocus
                />
                <Button
                  size="sm"
                  className="h-8 bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={saveBudget}
                  disabled={savingBudget}
                >
                  {savingBudget ? <Loader2 className="size-3.5 animate-spin" /> : 'حفظ'}
                </Button>
                <Button variant="ghost" size="sm" className="h-8" onClick={() => setEditingBudget(false)}>
                  إلغاء
                </Button>
              </div>
            ) : isCurrentMonth ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-stone-400 hover:text-amber-700 hover:bg-amber-50"
                onClick={() => {
                  setBudgetDraft(budget ? String(budget) : '');
                  setEditingBudget(true);
                }}
                aria-label="عدّل الميزانية"
              >
                <Pencil className="size-3.5" />
                عدّل
              </Button>
            ) : (
              <span className="text-[11px] text-stone-400">ميزانية الشهور اللي فاتت للعرض بس</span>
            )}
          </div>

          <div className="flex items-end justify-between flex-wrap gap-2">
            <div>
              <p
                className={cn(
                  'text-4xl font-extrabold tabular-nums leading-tight',
                  remaining <= 0 ? 'text-rose-600' : 'text-emerald-600'
                )}
              >
                {fmtMoney(remaining)} <span className="text-lg">ج</span>
              </p>
              <p className="text-xs text-stone-500 mt-0.5">باقي معاك من ميزانية الشهر</p>
            </div>
            <p className="text-sm text-stone-500 tabular-nums">
              صرفت <span className="font-bold text-rose-600">{fmtMoney(monthSpent)} ج</span> من{' '}
              {budget ? `${fmtMoney(budget)} ج` : '—'}
            </p>
          </div>

          {budget > 0 ? (
            <SekretirProgress
              value={spentPct}
              className="mt-3"
              barClassName={barColor}
              ariaLabel="نسبة الصرف من الميزانية"
            />
          ) : (
            <div className="mt-3">
              <p className="text-sm text-stone-400">
                لسه محددتش ميزانية — دوس «عدّل» واكتب ميزانيتك للشهر 💰
              </p>
              {isCurrentMonth && lastMonthBudget > 0 ? (
                <button
                  type="button"
                  onClick={() => void copyLastMonthBudget()}
                  disabled={copyingBudget}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-60"
                >
                  {copyingBudget ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Repeat className="size-3.5" />
                  )}
                  انسخ ميزانية الشهر اللي فات ({fmtMoney(lastMonthBudget)} ج)
                </button>
              ) : null}
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            <div className="rounded-xl bg-stone-50 border border-stone-100 px-3 py-2 text-center">
              <p className="text-[10px] text-stone-400">صرفت الشهر</p>
              <p className="text-sm font-extrabold text-rose-600 tabular-nums">
                {fmtMoney(monthSpent)} ج
              </p>
            </div>
            <div className="rounded-xl bg-stone-50 border border-stone-100 px-3 py-2 text-center">
              <p className="text-[10px] text-stone-400">{isCurrentMonth ? 'النهارده' : 'عدد العمليات'}</p>
              <p
                className={cn(
                  'text-sm font-extrabold tabular-nums',
                  isCurrentMonth ? 'text-rose-600' : 'text-stone-700'
                )}
              >
                {isCurrentMonth
                  ? `${fmtMoney(summary?.spentToday)} ج`
                  : (summary?.expenses.length ?? 0)}
              </p>
            </div>
            <div className="rounded-xl bg-stone-50 border border-stone-100 px-3 py-2 text-center">
              <p className="text-[10px] text-stone-400">متوسط يومي</p>
              <p className="text-sm font-extrabold text-amber-700 tabular-nums">
                {fmtMoney(summary?.dailyAverage)} ج
              </p>
            </div>
            <div className="rounded-xl bg-stone-50 border border-stone-100 px-3 py-2 text-center">
              <p className="text-[10px] text-stone-400">دخل الشهر</p>
              <p className="text-sm font-extrabold text-emerald-600 tabular-nums">
                {fmtMoney(summary?.incomeThisMonth)} ج
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category breakdown */}
      {summary && summary.byCategory.length > 0 ? (
        <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <CardContent className="p-4 sm:p-5">
            <h2 className="font-bold text-stone-800 mb-3">صرفت في إيه؟</h2>
            <ul className="space-y-3">
              {summary.byCategory.map((c) => {
                const meta = CATEGORY_META[c.category];
                const limit = summary.categoryLimits.find((cl) => cl.category === c.category);
                return (
                  <li key={c.category}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-stone-600">
                        {meta.icon} {meta.label}
                        {limit ? (
                          <span className="text-[10px] text-stone-400 font-normal"> (حد {fmtMoney(limit.limit)} ج)</span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          'font-bold tabular-nums',
                          limit && limit.over ? 'text-rose-600' : 'text-stone-700'
                        )}
                      >
                        {fmtMoney(c.total)} ج
                      </span>
                    </div>
                    <SekretirProgress
                      value={(c.total / maxCat) * 100}
                      className="h-2"
                      barClassName={
                        limit && limit.over
                          ? 'bg-rose-500'
                          : c.category === 'FOOD'
                            ? 'bg-amber-500'
                            : 'bg-stone-400'
                      }
                      ariaLabel={`مصاريف ${meta.label}`}
                    />
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Category limits (per-category budgets) */}
      {summary ? (
        <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <CardContent className="p-4 sm:p-5">
            <h2 className="font-bold text-stone-800 flex items-center gap-2 mb-1">
              <Target className="size-4 text-amber-600" />
              حدود الفئات
            </h2>
            <p className="text-[11px] text-stone-400 mb-3">
              حدد سقف صرف لكل فئة وسكرتير ينبّهك قبل ما تعديها
            </p>

            {summary.categoryLimits.length > 0 ? (
              <ul className="space-y-3 mb-4">
                {summary.categoryLimits.map((cl) => {
                  const meta = CATEGORY_META[cl.category];
                  const barColor = cl.over ? 'bg-rose-500' : cl.pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
                  return (
                    <li key={cl.category} className={cn('rounded-xl border px-3 py-2.5', cl.over ? 'border-rose-200 bg-rose-50/50' : 'border-stone-100 bg-stone-50/60')}>
                      <div className="flex items-center justify-between text-xs mb-1.5 gap-2">
                        <span className="font-semibold text-stone-700 flex items-center gap-1.5 min-w-0">
                          <span aria-hidden>{meta.icon}</span>
                          <span className="truncate">{meta.label}</span>
                          {cl.over ? (
                            <span className="shrink-0 rounded-full bg-rose-100 text-rose-700 px-1.5 py-0.5 text-[10px] font-bold">
                              عدّيت الحد!
                            </span>
                          ) : cl.pct >= 80 ? (
                            <span className="shrink-0 rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[10px] font-bold">
                              قربت
                            </span>
                          ) : null}
                        </span>
                        <span className={cn('font-bold tabular-nums shrink-0', cl.over ? 'text-rose-600' : 'text-stone-600')}>
                          {fmtMoney(cl.spent)} / {fmtMoney(cl.limit)} ج
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <SekretirProgress
                          value={cl.pct}
                          className="h-2 flex-1"
                          barClassName={barColor}
                          ariaLabel={`حد ${meta.label}`}
                        />
                        <button
                          type="button"
                          onClick={() => setLimitForm({ category: cl.category, amount: String(cl.limit) })}
                          className="shrink-0 rounded-full p-1 text-stone-400 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                          aria-label={`عدل حد ${meta.label}`}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveCategoryLimit(cl.category, true)}
                          className="shrink-0 rounded-full p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                          aria-label={`شيل حد ${meta.label}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-stone-400 mb-4">لسه مفيش حدود — اختار فئة واكتب سقف صرفها للشهر.</p>
            )}

            {/* add / update limit row */}
            {isCurrentMonth ? (
              <div className="flex items-center gap-2 flex-wrap">
                <Select
                  value={limitForm.category}
                  onValueChange={(v) => setLimitForm((f) => ({ ...f, category: v }))}
                  dir="rtl"
                >
                  <SelectTrigger className="w-[140px] h-9 rounded-xl text-xs bg-white" aria-label="اختار الفئة">
                    <SelectValue placeholder="فئة…" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {CATEGORY_OPTIONS.filter((o) => !summary.categoryLimits.some((cl) => cl.category === o.value) || limitForm.category === o.value).map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={limitForm.amount}
                  onChange={(e) => setLimitForm((f) => ({ ...f, amount: e.target.value }))}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  placeholder="الحد (ج)"
                  className="flex-1 min-w-[100px] h-9 rounded-xl text-sm"
                  aria-label="مبلغ حد الفئة"
                />
                <Button
                  size="sm"
                  onClick={() => void saveCategoryLimit()}
                  disabled={!limitForm.category || !limitForm.amount || Number(limitForm.amount) <= 0 || savingLimit}
                  className="h-9 rounded-xl bg-amber-600 hover:bg-amber-700 text-white gap-1"
                >
                  {savingLimit ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  حدد
                </Button>
              </div>
            ) : (
              <p className="text-xs text-stone-400">تعديل الحدود متاح في الشهر الحالي بس (الشهر ده للعرض بس).</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Upcoming recurring */}
      {summary && summary.upcomingRecurring.length > 0 ? (
        <Card className="bg-white border border-amber-100 rounded-2xl shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <h2 className="font-bold text-stone-800 flex items-center gap-2 mb-3">
              <Repeat className="size-4 text-amber-600" />
              متوقع عليك
            </h2>
            <ul className="space-y-2">
              {summary.upcomingRecurring.map((r) => {
                const meta = CATEGORY_META[r.category];
                return (
                  <li
                    key={r.id}
                    className="flex items-center gap-2.5 rounded-xl bg-amber-50/60 border border-amber-100 px-3 py-2"
                  >
                    <span aria-hidden className="text-lg shrink-0">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-800 truncate">
                        {r.description ?? meta.label}
                      </p>
                      <p className="text-[10px] text-stone-500">
                        المعاد: {relativeDay(r.nextDueAt)} — {fmtDayMonth(r.nextDueAt)}
                      </p>
                    </div>
                    <span className="text-sm font-extrabold text-rose-600 tabular-nums shrink-0">
                      {fmtMoney(r.amount)} ج
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Transactions */}
      <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
        <CardContent className="p-4 sm:p-5">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TxTab)} dir="rtl">
            <div className="flex items-center justify-between gap-2 mb-3">
              <TabsList>
                <TabsTrigger value="expenses" className="px-4">
                  مصروفات
                </TabsTrigger>
                <TabsTrigger value="incomes" className="px-4">
                  دخل
                </TabsTrigger>
              </TabsList>
              <span className="text-xs text-stone-400">{fmtDayMonth(`${month}-01`)}</span>
            </div>

            {tab === 'expenses' ? (
              summary && summary.expenses.length > 0 ? (
                <ul className="divide-y divide-stone-50 sekretir-scroll max-h-96 overflow-y-auto">
                  {[...summary.expenses]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((x) => {
                      const meta = CATEGORY_META[x.category];
                      return (
                        <li
                          key={x.id}
                          className="group flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-xl hover:bg-amber-50/50 transition-colors"
                        >
                          <span
                            className="size-9 rounded-xl bg-stone-50 border border-stone-100 group-hover:bg-white flex items-center justify-center text-base shrink-0 transition-colors"
                            aria-hidden
                          >
                            {meta.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-stone-800 truncate">
                              {x.description || meta.label}
                            </p>
                            <p className="text-[10px] text-stone-400">
                              {fmtDayMonth(x.date)}
                              {x.isRecurring ? ' • 🔁 متكرر' : ''}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 shrink-0 hidden sm:block">
                            {meta.icon} {meta.label}
                          </span>
                          <span className="text-sm font-extrabold text-rose-600 tabular-nums shrink-0">
                            −{fmtMoney(x.amount)} ج
                          </span>
                          <div className="flex items-center shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-stone-300 hover:text-amber-700 hover:bg-amber-100 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                              onClick={() => openEditExpense(x)}
                              aria-label="عدّل المصروف"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-stone-300 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                              onClick={() => deleteExpense(x.id)}
                              aria-label="امسح المصروف"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              ) : (
                <p className="py-8 text-center text-sm text-stone-400">
                  مفيش مصاريف مسجلة الشهر ده 👏
                </p>
              )
            ) : summary && summary.incomes.length > 0 ? (
              <ul className="divide-y divide-stone-50 sekretir-scroll max-h-96 overflow-y-auto">
                {[...summary.incomes]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((x) => (
                    <li key={x.id} className="flex items-center gap-3 py-2.5">
                      <span
                        className="size-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0"
                        aria-hidden
                      >
                        <TrendingUp className="size-4 text-emerald-600" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-stone-800 truncate">
                          {x.source || 'دخل'}
                        </p>
                        <p className="text-[10px] text-stone-400">{fmtDayMonth(x.date)}</p>
                      </div>
                      <span className="text-sm font-extrabold text-emerald-600 tabular-nums shrink-0">
                        +{fmtMoney(x.amount)} ج
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-stone-300 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                        onClick={() => deleteIncome(x.id)}
                        aria-label="امسح الدخل"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-stone-400">مفيش دخل مسجل الشهر ده 😅</p>
            )}
          </Tabs>
        </CardContent>
      </Card>

      {/* Floating add expense button */}
      <Button
        className="fixed bottom-20 md:bottom-6 end-4 md:end-6 z-30 rounded-full bg-amber-600 hover:bg-amber-700 text-white shadow-lg px-5 h-12 active:scale-95 transition-transform"
        onClick={() => {
          setEditingExpense(null);
          setExpForm({
            amount: '',
            category: 'FOOD',
            description: '',
            date: defaultDateInMonth(month),
            isRecurring: false,
            recurrence: 'none',
          });
          setExpenseOpen(true);
        }}
      >
        <Plus className="size-5" />
        ضيف مصروف
      </Button>

      {/* Add / edit expense dialog */}
      <Dialog
        open={expenseOpen}
        onOpenChange={(o) => {
          setExpenseOpen(o);
          if (!o) setEditingExpense(null);
        }}
      >
        <DialogContent className="rounded-2xl max-h-[90dvh] overflow-y-auto sekretir-scroll">
          <DialogHeader>
            <DialogTitle>{editingExpense ? 'تعديل المصروف ✏️' : 'مصروف جديد 💸'}</DialogTitle>
            <DialogDescription>
              {editingExpense
                ? 'عدّل المبلغ أو انقله لفئة تانية — سكرتير هيحدّث الحسابات.'
                : 'سجل اللي صرفته — سكرتير هيحسبه معاك.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="exp-amount">المبلغ (جنيه)</Label>
                <Input
                  id="exp-amount"
                  type="number"
                  min={0}
                  dir="ltr"
                  value={expForm.amount}
                  onChange={(e) => setExpForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-date">اليوم</Label>
                <Input
                  id="exp-date"
                  type="date"
                  dir="ltr"
                  value={expForm.date}
                  onChange={(e) => setExpForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>التصنيف</Label>
              <Select
                value={expForm.category}
                onValueChange={(v) => setExpForm((f) => ({ ...f, category: v as ExpenseCategory }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-desc">وصف</Label>
              <Input
                id="exp-desc"
                value={expForm.description}
                onChange={(e) => setExpForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="مثلاً: فطار من الشارع"
              />
            </div>
            {!editingExpense ? (
              <div className="flex items-center justify-between rounded-xl bg-stone-50 border border-stone-100 px-3 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-stone-700">مصروف متكرر</p>
                  <p className="text-[10px] text-stone-400">زي فاتورة النت كل شهر</p>
                </div>
                <Switch
                  checked={expForm.isRecurring}
                  onCheckedChange={(v) => setExpForm((f) => ({ ...f, isRecurring: v }))}
                  aria-label="مصروف متكرر"
                />
              </div>
            ) : null}
            {expForm.isRecurring && !editingExpense ? (
              <div className="space-y-2">
                <Label>يتكرر امتى؟</Label>
                <Select
                  value={expForm.recurrence}
                  onValueChange={(v) => setExpForm((f) => ({ ...f, recurrence: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        🔁 {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setExpenseOpen(false);
                setEditingExpense(null);
              }}
            >
              إلغاء
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={saveExpense}
              disabled={addingExpense || !expForm.amount}
            >
              {addingExpense ? <Loader2 className="size-4 animate-spin" /> : editingExpense ? <Pencil className="size-4" /> : <Plus className="size-4" />}
              {editingExpense ? 'احفظ التعديل' : 'سجل المصروف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add income dialog */}
      <Dialog open={incomeOpen} onOpenChange={setIncomeOpen}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>دخل جديد 💵</DialogTitle>
            <DialogDescription>مرتب، مشروع، أي فلوس داخلك.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="inc-amount">المبلغ (جنيه)</Label>
                <Input
                  id="inc-amount"
                  type="number"
                  min={0}
                  dir="ltr"
                  value={incForm.amount}
                  onChange={(e) => setIncForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="5000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inc-date">اليوم</Label>
                <Input
                  id="inc-date"
                  type="date"
                  dir="ltr"
                  value={incForm.date}
                  onChange={(e) => setIncForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inc-source">المنبع</Label>
              <Input
                id="inc-source"
                value={incForm.source}
                onChange={(e) => setIncForm((f) => ({ ...f, source: e.target.value }))}
                placeholder="مثلاً: مرتب الشهر"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIncomeOpen(false)}>
              إلغاء
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={addIncome}
              disabled={addingIncome || !incForm.amount}
            >
              {addingIncome ? <Loader2 className="size-4 animate-spin" /> : <ArrowDownCircle className="size-4" />}
              سجل الدخل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
