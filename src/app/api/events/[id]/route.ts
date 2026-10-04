import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// PATCH /api/events/[id] — update event.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const body = await req.json();
    const event = await container.eventUseCases.update(userId, id, body);
    return { event };
  });
}

// DELETE /api/events/[id] — remove event.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    await container.eventUseCases.delete(userId, id);
    return { deleted: id };
  });
}
