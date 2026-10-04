import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// GET /api/expenses?month=YYYY-MM — list expenses.
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') ?? undefined;
    return { expenses: await container.financeUseCases.listExpenses(userId, month) };
  });
}

// POST /api/expenses — record an expense.
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const body = await req.json();
    const expense = await container.financeUseCases.createExpense(userId, body);
    return { expense };
  });
}
