import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { asString, handleRoute, setAuthCookie } from '@/lib/api';

// POST /api/auth/login — verify credentials + start session.
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const body = await req.json();
    const result = await container.authUseCases.login({
      email: asString(body.email, 'email'),
      password: asString(body.password, 'password'),
    });
    await setAuthCookie(result.token);
    return { user: result.user };
  });
}
