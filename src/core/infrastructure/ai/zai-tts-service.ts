import ZAI from 'z-ai-web-dev-sdk';
import type { ITextToSpeechService } from '../../application/ports';

// ============================================================
// Text-to-speech provider implementation (z-ai SDK TTS) behind
// the ITextToSpeechService port — سكرتير يرد بصوته (BRD §43).
// ============================================================

type ZaiClient = Awaited<ReturnType<typeof ZAI.create>>;

let clientPromise: Promise<ZaiClient> | null = null;

function getClient(): Promise<ZaiClient> {
  if (!clientPromise) clientPromise = ZAI.create();
  return clientPromise;
}

const MAX_TTS_CHARS = 1000; // API hard limit is 1024 — stay safe

export class ZaiTextToSpeechService implements ITextToSpeechService {
  async synthesize(text: string): Promise<{ audioBase64: string; mimeType: string }> {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_TTS_CHARS);
    if (!clean) throw new Error('empty tts text');
    const client = await getClient();
    const response = await client.audio.tts.create({
      input: clean,
      voice: 'tongtong',
      speed: 1.0,
      response_format: 'wav',
      stream: false,
    });
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));
    if (buffer.length < 100) throw new Error('empty tts audio');
    return { audioBase64: buffer.toString('base64'), mimeType: 'audio/wav' };
  }
}
