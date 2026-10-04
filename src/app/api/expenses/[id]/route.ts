import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// DELETE /api/expenses/[id] — remove an expense.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    await container.financeUseCases.deleteExpense(userId, id);
    return { deleted: id };
  });
}
