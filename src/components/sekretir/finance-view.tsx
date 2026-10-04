'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Loader2,
  Pencil,
  Plus,
  Repeat,
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
  type FinanceSummaryDTO,
  type Recurrence,
} from '@/lib/sekretir/api';
import { CATEGORY_META, CATEGORY_OPTIONS, RECURRENCE_OPTIONS, fmtMoney } from '@/lib/sekretir/constants';
import { fmtDayMonth, relativeDay, todayKey } from '@/lib/sekretir/date-utils';
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

  // add expense dialog
  const [expenseOpen, setExpenseOpen] = useState(false);
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

  const month = todayKey().slice(0, 7);

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

  async function addExpense() {
    const amount = Number(expForm.amount);
    if (!amount || amount <= 0 || addingExpense) return;
    setAddingExpense(true);
    try {
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
      setExpenseOpen(false);
      toast.success('سجلت المصروف 💸');
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setAddingExpense(false);
    }
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-stone-900">الفلوس</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 rounded-full"
            onClick={() => {
              setIncForm({ amount: '', source: '', date: todayKey() });
              setIncomeOpen(true);
            }}
          >
            <ArrowUpCircle className="size-4" />
            ضيف دخل
          </Button>
        </div>
      </div>

      {/* Budget card */}
      <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-stone-800 flex items-center gap-2">
              <Wallet className="size-5 text-amber-600" />
              ميزانية الشهر
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
            ) : (
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
            <p className="text-sm text-stone-400 mt-3">
              لسه محددتش ميزانية — دوس «عدّل» واكتب ميزانيتك للشهر 💰
            </p>
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
              <p className="text-[10px] text-stone-400">النهارده</p>
              <p className="text-sm font-extrabold text-rose-600 tabular-nums">
                {fmtMoney(summary?.spentToday)} ج
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
                return (
                  <li key={c.category}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-stone-600">
                        {meta.icon} {meta.label}
                      </span>
                      <span className="font-bold text-stone-700 tabular-nums">{fmtMoney(c.total)} ج</span>
                    </div>
                    <SekretirProgress
                      value={(c.total / maxCat) * 100}
                      className="h-2"
                      barClassName={c.category === 'FOOD' ? 'bg-amber-500' : 'bg-stone-400'}
                      ariaLabel={`مصاريف ${meta.label}`}
                    />
                  </li>
                );
              })}
            </ul>
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
                        <li key={x.id} className="flex items-center gap-3 py-2.5">
                          <span
                            className="size-9 rounded-xl bg-stone-50 border border-stone-100 flex items-center justify-center text-base shrink-0"
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
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-stone-300 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                            onClick={() => deleteExpense(x.id)}
                            aria-label="امسح المصروف"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
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
        className="fixed bottom-20 md:bottom-6 end-4 md:end-6 z-30 rounded-full bg-amber-600 hover:bg-amber-700 text-white shadow-lg px-5 h-12"
        onClick={() => {
          setExpForm({
            amount: '',
            category: 'FOOD',
            description: '',
            date: todayKey(),
            isRecurring: false,
            recurrence: 'none',
          });
          setExpenseOpen(true);
        }}
      >
        <Plus className="size-5" />
        ضيف مصروف
      </Button>

      {/* Add expense dialog */}
      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent className="rounded-2xl max-h-[90dvh] overflow-y-auto sekretir-scroll">
          <DialogHeader>
            <DialogTitle>مصروف جديد 💸</DialogTitle>
            <DialogDescription>سجل اللي صرفته — سكرتير هيحسبه معاك.</DialogDescription>
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
            {expForm.isRecurring ? (
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
            <Button variant="outline" onClick={() => setExpenseOpen(false)}>
              إلغاء
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={addExpense}
              disabled={addingExpense || !expForm.amount}
            >
              {addingExpense ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              سجل المصروف
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
