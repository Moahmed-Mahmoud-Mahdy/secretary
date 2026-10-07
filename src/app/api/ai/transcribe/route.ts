import type { NextRequest } from 'next/server';
import { container } from '@/core/container';
import { AppError } from '@/core/domain/errors';
import { handleRoute, requireUserId } from '@/lib/api';

const MAX_AUDIO_BASE64_LENGTH = 15 * 1024 * 1024; // ~11MB raw audio

export const maxDuration = 30;

// POST /api/ai/transcribe — voice input → text (BRD §5.2).
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    await requireUserId();
    const body = await req.json();
    const audio = typeof body?.audio === 'string' ? body.audio : '';
    if (!audio) throw new AppError('مفيش صوت في الطلب — سجل تاني');
    if (audio.length > MAX_AUDIO_BASE64_LENGTH) throw new AppError('التسجيل طويل أوي — جرب تسجل أقل');
    const text = await container.speech.transcribe(audio);
    return { text };
  });
}
