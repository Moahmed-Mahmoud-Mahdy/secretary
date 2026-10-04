import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// GET /api/habits — recurring habits with check-in streaks (BRD §16).
export async function GET() {
  return handleRoute(async () => {
    const userId = await requireUserId();
    return { habits: await container.taskUseCases.listHabits(userId) };
  });
}
