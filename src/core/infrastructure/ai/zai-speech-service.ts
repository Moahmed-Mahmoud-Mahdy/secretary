import ZAI from 'z-ai-web-dev-sdk';
import type { ISpeechToTextService } from '../../application/ports';

// ============================================================
// Speech-to-text provider implementation (z-ai SDK ASR) behind
// the ISpeechToTextService port (BRD §5.2 voice input).
// ============================================================

type ZaiClient = Awaited<ReturnType<typeof ZAI.create>>;

let clientPromise: Promise<ZaiClient> | null = null;

function getClient(): Promise<ZaiClient> {
  if (!clientPromise) clientPromise = ZAI.create();
  return clientPromise;
}

export class ZaiSpeechService implements ISpeechToTextService {
  async transcribe(audioBase64: string): Promise<string> {
    if (!audioBase64 || audioBase64.length < 100) return '';
    const client = await getClient();
    const response = await client.audio.asr.create({ file_base64: audioBase64 });
    return (response?.text ?? '').trim();
  }
}
