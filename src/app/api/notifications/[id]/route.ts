import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// PATCH /api/notifications/[id] — mark one as read.
export async function PATCH(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { id } = await ctx.params;
    await container.notifications.markRead(userId, id);
    return { id, isRead: true };
  });
}
