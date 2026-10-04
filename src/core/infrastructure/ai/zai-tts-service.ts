import type { ITextToSpeechService } from '../../application/ports';

// ============================================================
// Text-to-speech provider implementation behind
// the ITextToSpeechService port — سكرتير يرد بصوته (BRD §43).
// ============================================================

const MAX_TTS_CHARS = 1000; // API hard limit is 1024 — stay safe

export class ZaiTextToSpeechService implements ITextToSpeechService {
  async synthesize(text: string): Promise<{ audioBase64: string; mimeType: string }> {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_TTS_CHARS);
    if (!clean) throw new Error('empty tts text');
    console.warn('TTS is currently disabled');
    throw new Error('خدمة تحويل النص لصوت غير متوفرة حالياً');
  }
}
