import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// GET /api/budget — current month finance summary (budget, spent, remaining...).
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') ?? undefined;
    return container.financeUseCases.summary(userId, month);
  });
}

// POST /api/budget — set this month's budget.
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const body = await req.json();
    const amount = Number(body?.amount);
    await container.financeUseCases.setBudget(userId, amount);
    return { amount };
  });
}
