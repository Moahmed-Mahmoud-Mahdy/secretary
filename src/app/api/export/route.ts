import { NextResponse } from 'next/server';
import { container } from '@/core/container';
import { fail, requireUserId } from '@/lib/api';
import { AppError } from '@/core/domain/errors';

// GET /api/export — full JSON backup of the signed-in user's data.
// Returns a downloadable file (Content-Disposition attachment).
// NOTE: builds a raw file response, so it can't go through handleRoute
// (which would wrap the stream in the {success,data} envelope).
export async function GET() {
  try {
    const userId = await requireUserId();
    const bundle = await container.exportUseCases.exportAll(userId);
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="sekretir-backup-${day}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof AppError) return fail(error.message, error.status);
    console.error('[api] export error:', error);
    return fail('حصلت مشكلة غير متوقعة — جرّب تاني', 500);
  }
}
