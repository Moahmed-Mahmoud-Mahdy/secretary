import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// GET /api/plan?date=YYYY-MM-DD — today plan.
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') ?? undefined;
    return container.planningUseCases.getDayPlan(userId, date);
  });
}

// POST /api/plan — (re)generate the day plan (AI re-planning, BRD §16).
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const date = typeof body?.date === 'string' ? body.date : undefined;
    return container.planningUseCases.generatePlan(userId, date);
  });
}
