import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// GET /api/dashboard — context-aware home (BRD §25, §29).
export async function GET() {
  return handleRoute(async () => {
    const userId = await requireUserId();
    return container.dashboardUseCases.getDashboard(userId);
  });
}
