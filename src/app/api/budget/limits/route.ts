import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// POST /api/budget/limits — set a per-category monthly limit.
// Body: { category, amount, month? } — amount <= 0 removes the limit.
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const body = await req.json();
    const category = String(body?.category ?? '');
    const amount = Number(body?.amount ?? 0);
    const month = body?.month ? String(body.month) : undefined;
    if (!category) throw new Error('category required');
    if (amount > 0) {
      await container.financeUseCases.setCategoryBudget(userId, category, amount, month);
      return { category, limit: amount };
    }
    await container.financeUseCases.removeCategoryBudget(userId, category, month);
    return { category, limit: null };
  });
}
