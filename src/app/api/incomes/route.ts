import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// GET /api/incomes?month=YYYY-MM — list incomes.
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') ?? undefined;
    return { incomes: await container.financeUseCases.listIncomes(userId, month) };
  });
}

// POST /api/incomes — record income.
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const body = await req.json();
    const income = await container.financeUseCases.createIncome(userId, body);
    return { income };
  });
}
