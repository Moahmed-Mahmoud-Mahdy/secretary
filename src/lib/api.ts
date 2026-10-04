import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AppError, UnauthorizedError } from '@/core/domain/errors';
import { tokenService } from '@/core/container';

// ============================================================
// Presentation helpers — uniform API envelope + JWT cookie
// session handling (BRD §30).
// ============================================================

export const AUTH_COOKIE = 'sekretir_token';
const TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // must match JWT expiry (7 days)

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

export function fail(error: string, status = 400): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

/** Wraps a route handler: converts errors into the API envelope. */
export async function handleRoute(fn: () => Promise<unknown>): Promise<NextResponse> {
  try {
    const data = await fn();
    return ok(data);
  } catch (error) {
    if (error instanceof AppError) {
      return fail(error.message, error.status);
    }
    console.error('[api] unexpected error:', error);
    return fail('حصلت مشكلة غير متوقعة — جرّب تاني', 500);
  }
}

/** Resolves the authenticated user id from the JWT cookie. */
export async function requireUserId(): Promise<string> {
  const store = await cookies();
  const token = store.get(AUTH_COOKIE)?.value;
  if (!token) throw new UnauthorizedError();
  const payload = await tokenService.verify(token);
  if (!payload?.sub) throw new UnauthorizedError('الجلسة خلصت — سجل دخول تاني');
  return payload.sub;
}

export async function setAuthCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TOKEN_MAX_AGE,
  });
}

export async function clearAuthCookie(): Promise<void> {
  const store = await cookies();
  store.set(AUTH_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

export function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(`الحقل "${field}" مطلوب`);
  }
  return value.trim();
}
