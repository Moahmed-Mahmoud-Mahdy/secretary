import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// GET /api/notifications — recent notifications.
export async function GET() {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const [notifications, unreadCount] = await Promise.all([
      container.notifications.listRecent(userId),
      container.notifications.unreadCount(userId),
    ]);
    return {
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount,
    };
  });
}

// POST /api/notifications — mark all as read.
export async function POST() {
  return handleRoute(async () => {
    const userId = await requireUserId();
    await container.notifications.markAllRead(userId);
    return { allRead: true };
  });
}
