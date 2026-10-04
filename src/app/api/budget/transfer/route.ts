import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// POST /api/budget/transfer — move budget room from one category
// limit to another (BRD §19). Body: { from, to, amount, month? }.
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const body = await req.json();
    const from = String(body?.from ?? '');
    const to = String(body?.to ?? '');
    const amount = Number(body?.amount ?? 0);
    const month = body?.month ? String(body.month) : undefined;
    if (!from || !to) throw new Error('from/to categories required');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be > 0');
    const res = await container.financeUseCases.transferCategoryBudget(userId, from, to, amount, month);
    return { from: res.from, to: res.to, fromLimit: res.fromLimit, toLimit: res.toLimit };
  });
}
