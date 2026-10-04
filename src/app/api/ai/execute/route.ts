import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { AppError } from '@/core/domain/errors';
import { handleRoute, requireUserId } from '@/lib/api';
import type { PendingActionDTO } from '@/core/application/use-cases/ai-chat-use-cases';

// POST /api/ai/execute — run a user-confirmed action (BRD §8).
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const userId = await requireUserId();
    const body = await req.json();
    const pending = body?.pending as PendingActionDTO | undefined;
    if (!pending || typeof pending.type !== 'string' || typeof pending.payload !== 'object') {
      throw new AppError('الطلب ناقص أو مش صالح');
    }
    const executed = await container.aiChatUseCases.executeConfirmedAction(userId, pending);
    return { executed };
  });
}
