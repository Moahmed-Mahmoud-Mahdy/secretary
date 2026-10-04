import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// PATCH /api/tasks/[id] — update / complete a task.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const body = await req.json();
    const task = await container.taskUseCases.update(userId, id, body);
    return { task };
  });
}

// DELETE /api/tasks/[id] — remove a task.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    await container.taskUseCases.delete(userId, id);
    return { deleted: id };
  });
}
