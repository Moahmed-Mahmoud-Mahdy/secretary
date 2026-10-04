import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// PATCH /api/expenses/[id] — edit an expense (amount/category/description/date).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const body = (await req.json()) as Record<string, unknown>;
    const expense = await container.financeUseCases.updateExpense(userId, id, {
      amount: typeof body.amount === 'number' ? body.amount : undefined,
      category: typeof body.category === 'string' ? body.category : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      date: typeof body.date === 'string' ? body.date : undefined,
    });
    return { expense };
  });
}

// DELETE /api/expenses/[id] — remove an expense.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    await container.financeUseCases.deleteExpense(userId, id);
    return { deleted: id };
  });
}
