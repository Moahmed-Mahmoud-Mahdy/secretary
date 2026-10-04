import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// GET /api/auth/me — current session user.
export async function GET() {
  return handleRoute(async () => {
    const userId = await requireUserId();
    return { user: await container.authUseCases.me(userId) };
  });
}
