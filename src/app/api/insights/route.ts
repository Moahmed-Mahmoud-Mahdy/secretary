import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// GET /api/insights — smart insights & warnings (BRD §24).
export async function GET() {
  return handleRoute(async () => {
    const userId = await requireUserId();
    return { insights: await container.dashboardUseCases.listInsights(userId) };
  });
}
