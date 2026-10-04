import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// GET /api/auth/me — current session user.
export async function GET() {
  return handleRoute(async () => {
    const userId = await requireUserId();
    return { user: await container.authUseCases.me(userId) };
  });
}

// PATCH /api/auth/me — edit profile (display name).
export async function PATCH(req: Request) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    return { user: await container.authUseCases.updateProfile(userId, { name: body?.name }) };
  });
}
