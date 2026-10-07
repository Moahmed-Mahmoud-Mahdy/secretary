import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { asString, handleRoute, requireUserId } from '@/lib/api';

export const maxDuration = 30;

// POST /api/ai/chat — unified natural-language input (BRD §6).
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const body = await req.json();
    const message = asString(body.message, 'message');
    return container.aiChatUseCases.handleMessage(userId, message);
  });
}
