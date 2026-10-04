import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// GET /api/events — list all events.
export async function GET() {
  return handleRoute(async () => {
    const userId = await requireUserId();
    return { events: await container.eventUseCases.list(userId) };
  });
}

// POST /api/events — create a fixed event.
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const body = await req.json();
    const event = await container.eventUseCases.create(userId, body);
    return { event };
  });
}
