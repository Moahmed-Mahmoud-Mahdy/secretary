import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// DELETE /api/incomes/[id] — remove income.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    await container.financeUseCases.deleteIncome(userId, id);
    return { deleted: id };
  });
}
