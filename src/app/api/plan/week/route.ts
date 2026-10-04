import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// GET /api/plan/week?start=YYYY-MM-DD&days=7 — multi-day plan overview
// (slots per day for the weekly planner grid).
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const start = searchParams.get('start') ?? undefined;
    const days = Number(searchParams.get('days') ?? 7) || 7;
    return container.planningUseCases.getWeekPlan(userId, start, days);
  });
}
