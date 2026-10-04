import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// GET /api/search?q=… — global Arabic-aware search across the
// signed-in user's tasks / projects / events / expenses / incomes.
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') ?? '';
    return container.searchUseCases.search(userId, q);
  });
}
