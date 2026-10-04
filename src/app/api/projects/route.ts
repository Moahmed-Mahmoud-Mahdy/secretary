import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { handleRoute, requireUserId } from '@/lib/api';

// GET /api/projects — list projects with progress.
export async function GET() {
  return handleRoute(async () => {
    const userId = await requireUserId();
    return { projects: await container.projectUseCases.list(userId) };
  });
}

// POST /api/projects — create a project.
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const body = await req.json();
    const project = await container.projectUseCases.create(userId, body);
    return { project };
  });
}
