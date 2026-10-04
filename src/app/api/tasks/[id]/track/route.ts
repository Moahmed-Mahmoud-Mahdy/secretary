import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { ValidationError } from '@/core/domain/errors';
import { handleRoute, requireUserId } from '@/lib/api';

// POST /api/tasks/[id]/track — start/stop a work-time tracking session
// (BRD §17 personalization: real durations feed smarter estimates).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const body = await req.json();
    const action = typeof body?.action === 'string' ? body.action.toLowerCase() : '';
    if (action !== 'start' && action !== 'stop') {
      throw new ValidationError('action لازم تكون start أو stop');
    }
    const task =
      action === 'start'
        ? await container.taskUseCases.startTracking(userId, id)
        : await container.taskUseCases.stopTracking(userId, id);
    return { task };
  });
}
