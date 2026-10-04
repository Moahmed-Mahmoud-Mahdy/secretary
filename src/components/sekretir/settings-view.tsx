'use client';

import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  CalendarClock,
  Check,
  Download,
  Keyboard,
  Loader2,
  Pencil,
  ShieldCheck,
  UserRound,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  endpoints,
  apiErrorMessage,
  ApiError,
  isAuthError,
  type UserDTO,
} from '@/lib/sekretir/api';
import { cn } from '@/lib/utils';

// ============================================================
// الإعدادات — personal settings: profile, budget, data export,
// keyboard shortcuts + about (BRD §19 data ownership, §30).
// ============================================================

interface SettingsViewProps {
  user: UserDTO;
  onUserUpdated: (u: UserDTO) => void;
  onAuthError: () => void;
}

export function SettingsView({ user, onUserUpdated, onAuthError }: SettingsViewProps) {
  const [name, setName] = useState(user.name);
  const [savingName, setSavingName] = useState(false);
  const [budgetInput, setBudgetInput] = useState(user.monthlyBudget ? String(user.monthlyBudget) : '');
  const [savingBudget, setSavingBudget] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setName(user.name);
    setBudgetInput(user.monthlyBudget ? String(user.monthlyBudget) : '');
  }, [user]);

  const dirtyName = name.trim() !== user.name && name.trim().length >= 2;

  async function saveName() {
    if (!dirtyName) return;
    setSavingName(true);
    try {
      const { user: updated } = await endpoints.updateProfile(name.trim());
      onUserUpdated(updated);
      toast.success('تم يا صاحبي — اسمك بقى ' + updated.name + ' ✨');
    } catch (e) {
      if (isAuthError(e)) {
        onAuthError();
        return;
      }
      toast.error(apiErrorMessage(e));
    } finally {
      setSavingName(false);
    }
  }

  async function saveBudget() {
    const amount = Number(budgetInput);
    if (!budgetInput.trim() || Number.isNaN(amount) || amount <= 0) {
      toast.error('اكتب رقم صحيح للميزانية');
      return;
    }
    setSavingBudget(true);
    try {
      const { budget } = await endpoints.setBudget(amount);
      onUserUpdated({ ...user, monthlyBudget: budget });
      toast.success(`تمام — ميزانية الشهر بقيت ${budget.toLocaleString('en-US')} ج 💰`);
    } catch (e) {
      if (isAuthError(e)) {
        onAuthError();
        return;
      }
      toast.error(apiErrorMessage(e));
    } finally {
      setSavingBudget(false);
    }
  }

  async function downloadBackup() {
    setExporting(true);
    try {
      // Fetch as blob → reliable download + we control the filename.
      const res = await fetch('/api/export', { credentials: 'include' });
      if (!res.ok) throw new ApiError('فشل تحميل النسخة', res.status);
      const blob = await res.blob();
      const day = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sekretir-backup-${day}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('اتنزلت نسخة كاملة من بياناتك 📦', {
        description: 'JSON فيه مهامك وفلوسك وتقويمك كله',
      });
    } catch (e) {
      if (isAuthError(e)) {
        onAuthError();
        return;
      }
      toast.error(apiErrorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 pt-1">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 shadow-sm">
          <ShieldCheck className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900">الإعدادات</h1>
          <p className="text-sm text-stone-500">حسابك وبياناتك — أنت المسيطر عليها</p>
        </div>
      </div>

      {/* Profile */}
      <Card className="border-stone-200 bg-white rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold text-stone-800">
            <span className="flex size-7 items-center justify-center rounded-lg bg-stone-100 text-stone-600">
              <UserRound className="size-4" aria-hidden />
            </span>
            حسابك
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="أفاتار سكرتير"
              className="size-14 rounded-full object-cover ring-2 ring-amber-100 shadow-sm"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <label htmlFor="settings-name" className="text-xs font-bold text-stone-500">
                الاسم
              </label>
              <div className="flex gap-2">
                <Input
                  id="settings-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  className="h-10 rounded-xl border-stone-200 focus-visible:ring-amber-500"
                  aria-label="اسمك"
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={saveName}
                  disabled={!dirtyName || savingName}
                  aria-label="حفظ الاسم"
                  className="size-10 shrink-0 rounded-xl bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-40"
                >
                  {savingName ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="size-4" aria-hidden />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <Separator className="bg-stone-100" />

          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-stone-500 font-semibold">الإيميل</span>
            <span className="font-mono text-stone-700 text-xs sm:text-sm truncate">{user.email}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-stone-500 font-semibold">الجلسة</span>
            <Badge className="border-0 bg-emerald-100 text-emerald-700 gap-1">
              <BadgeCheck className="size-3" aria-hidden /> آمنة (JWT لمدة 7 أيام)
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Budget shortcut */}
      <Card className="border-stone-200 bg-white rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold text-stone-800">
            <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Wallet className="size-4" aria-hidden />
            </span>
            ميزانية الشهر
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-stone-500">
            الحد الشهري اللي بيتحسب عليه كل تحذيرات الفلوس.
            {user.monthlyBudget ? (
              <>
                {' '}
                الحالي: <span className="font-bold text-emerald-700">{user.monthlyBudget.toLocaleString('en-US')} ج</span>
              </>
            ) : (
              ' لسه محددناهوش — حدده عشان سكرتير ينبهك قبل ما تصرف زيادة.'
            )}
          </p>
          <div className="flex gap-2">
            <Input
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              inputMode="numeric"
              placeholder="مثال: 8000"
              className="h-10 rounded-xl border-stone-200 focus-visible:ring-emerald-500"
              aria-label="الميزانية الشهرية"
            />
            <Button
              type="button"
              onClick={saveBudget}
              disabled={savingBudget || budgetInput === String(user.monthlyBudget ?? '')}
              className="h-10 shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40"
            >
              {savingBudget ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'احفظ'}
            </Button>
          </div>
          <p className="text-xs text-stone-400 flex items-center gap-1">
            <CalendarClock className="size-3" aria-hidden /> للتحكم الكامل (حدود الأقسام والتحويلات) افتح
            تبويب «الفلوس».
          </p>
        </CardContent>
      </Card>

      {/* Data export */}
      <Card className="border-stone-200 bg-white rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold text-stone-800">
            <span className="flex size-7 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
              <Download className="size-4" aria-hidden />
            </span>
            نسخة احتياطية
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-stone-500">
            نزّل كل بياناتك (مهام، مشاريع، أحداث، خطة، فلوس، تنبيهات) في ملف JSON واحد — بياناتك ملكك.
          </p>
          <Button
            type="button"
            onClick={downloadBackup}
            disabled={exporting}
            variant="outline"
            className="h-10 rounded-xl border-sky-200 text-sky-700 hover:bg-sky-50 hover:text-sky-800 disabled:opacity-50"
          >
            {exporting ? (
              <>
                <Loader2 className="ms-2 size-4 animate-spin" aria-hidden /> بنجهز الملف…
              </>
            ) : (
              <>
                <Download className="ms-2 size-4" aria-hidden /> نزّل النسخة (JSON)
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Shortcuts + about */}
      <Card className="border-stone-200 bg-white rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold text-stone-800">
            <span className="flex size-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <Keyboard className="size-4" aria-hidden />
            </span>
            اختصارات الكيبورد
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {[
              { keys: ['⌘', 'K'], label: 'بحث سريع في كل حاجة' },
              { keys: ['/'], label: 'اقفز للمساعد واكتب' },
              { keys: ['1', '…', '6'], label: 'تنقل بين التبويبات' },
              { keys: ['Esc'], label: 'اقفل أي نافذة مفتوحة' },
            ].map((s) => (
              <li key={s.label} className="flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-2">
                <span className="flex shrink-0 gap-1" dir="ltr">
                  {s.keys.map((k) => (
                    <kbd
                      key={k}
                      className="min-w-6 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-center text-[11px] font-bold text-stone-600 shadow-sm"
                    >
                      {k}
                    </kbd>
                  ))}
                </span>
                <span className="text-stone-600 font-medium">{s.label}</span>
              </li>
            ))}
          </ul>
          <Separator className="my-4 bg-stone-100" />
          <p className="text-xs leading-relaxed text-stone-400">
            سكرتير — مساعدك الشخصي الذكي 🤖 بيتكلم مصري وبيفهمك على طول. التقويم بيسجل بالتوقيت المصري، وكل بياناتك
            معزولة لحسابك لوحدك.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
