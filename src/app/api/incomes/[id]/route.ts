import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// PATCH /api/incomes/[id] — edit income (amount/source/description/date).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const body = await req.json();
    const income = await container.financeUseCases.updateIncome(userId, id, body);
    return { income };
  });
}

// DELETE /api/incomes/[id] — remove income.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    await container.financeUseCases.deleteIncome(userId, id);
    return { deleted: id };
  });
}
