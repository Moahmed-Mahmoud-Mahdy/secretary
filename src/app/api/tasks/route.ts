import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// GET /api/tasks?status=&projectId= — list tasks.
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') ?? undefined;
    const projectId = searchParams.get('projectId') ?? undefined;
    return { tasks: await container.taskUseCases.list(userId, { status, projectId }) };
  });
}

// POST /api/tasks — create a task.
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const body = await req.json();
    const task = await container.taskUseCases.create(userId, body);
    return { task };
  });
}
