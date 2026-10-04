import { handleRoute, clearAuthCookie } from '@/lib/api';

// POST /api/auth/logout — clear the session cookie.
export async function POST() {
  return handleRoute(async () => {
    await clearAuthCookie();
    return { loggedOut: true };
  });
}
