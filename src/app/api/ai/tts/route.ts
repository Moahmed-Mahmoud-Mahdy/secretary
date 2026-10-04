import { container } from '@/core/container';
import { AppError } from '@/core/domain/errors';
import { handleRoute, requireUserId } from '@/lib/api';

const MAX_TEXT_LENGTH = 1000;

// POST /api/ai/tts — سكرتير يتكلم: text → spoken audio (BRD §43).
export async function POST(req: Request) {
  return handleRoute(async () => {
    await requireUserId();
    const body = await req.json();
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) throw new AppError('مفيش نص أحوله لصوت');
    if (text.length > MAX_TEXT_LENGTH) throw new AppError('النص طويل أوي على الصوت');
    const { audioBase64, mimeType } = await container.speechOut.synthesize(text);
    return { audio: audioBase64, mimeType };
  });
}
