import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { asString, handleRoute, requireUserId } from '@/lib/api';

// PATCH /api/plan/slots/[id] — mark slot DONE / MISSED / PLANNED.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    const body = await req.json();
    const status = asString(body?.status, 'status');
    await container.planningUseCases.markSlot(userId, id, status);
    return { id, status };
  });
}
