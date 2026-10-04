import type { ExpenseCategory, Priority, Recurrence } from './api';

// ============================================================
// Sekretir UI constants — Egyptian Arabic labels, colors, icons.
// No blue/indigo/purple anywhere. Amber = primary accent.
// ============================================================

export const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = [
  { value: 'FOOD', label: '🍔 أكل وشرب' },
  { value: 'TRANSPORT', label: '🚌 مواصلات' },
  { value: 'EDUCATION', label: '📚 تعليم' },
  { value: 'PROJECTS', label: '🛠️ مشاريع' },
  { value: 'BILLS', label: '💡 فواتير' },
  { value: 'SHOPPING', label: '🛍️ تسوق' },
  { value: 'ENTERTAINMENT', label: '🎮 ترفيه' },
  { value: 'OTHER', label: '📦 تاني' },
];

export const CATEGORY_META: Record<ExpenseCategory, { label: string; icon: string }> = {
  FOOD: { label: 'أكل وشرب', icon: '🍔' },
  TRANSPORT: { label: 'مواصلات', icon: '🚌' },
  EDUCATION: { label: 'تعليم', icon: '📚' },
  PROJECTS: { label: 'مشاريع', icon: '🛠️' },
  BILLS: { label: 'فواتير', icon: '💡' },
  SHOPPING: { label: 'تسوق', icon: '🛍️' },
  ENTERTAINMENT: { label: 'ترفيه', icon: '🎮' },
  OTHER: { label: 'تاني', icon: '📦' },
};

export const PRIORITY_META: Record<
  Priority,
  { label: string; badge: string; dot: string }
> = {
  LOW: { label: 'عادية', badge: 'bg-stone-100 text-stone-600', dot: 'bg-stone-400' },
  MEDIUM: { label: 'متوسطة', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  HIGH: { label: 'مهمة', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  URGENT: { label: 'مستعجلة', badge: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
};

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'LOW', label: 'عادية' },
  { value: 'MEDIUM', label: 'متوسطة' },
  { value: 'HIGH', label: 'مهمة' },
  { value: 'URGENT', label: 'مستعجلة' },
];

export const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: 'DAILY', label: 'كل يوم' },
  { value: 'WEEKLY', label: 'كل أسبوع' },
  { value: 'MONTHLY', label: 'كل شهر' },
];

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  DAILY: 'كل يوم',
  WEEKLY: 'كل أسبوع',
  MONTHLY: 'كل شهر',
};

export const CHAT_STORAGE_KEY = 'sekretir_chat';

/** Format EGP money, Arabic-friendly digits grouping. */
export function fmtMoney(n: number | null | undefined): string {
  const v = Math.round((n ?? 0) * 100) / 100;
  return v.toLocaleString('en-EG', { maximumFractionDigits: 2 });
}
