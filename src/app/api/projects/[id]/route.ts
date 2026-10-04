import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// GET /api/projects/[id] — project details + tasks.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    return container.projectUseCases.get(userId, id);
  });
}

// PATCH /api/projects/[id] — update project.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const body = await req.json();
    const project = await container.projectUseCases.update(userId, id, body);
    return { project };
  });
}

// DELETE /api/projects/[id] — delete project (tasks are detached).
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    await container.projectUseCases.delete(userId, id);
    return { deleted: id };
  });
}
