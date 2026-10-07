import type { ITextToSpeechService } from '../../application/ports';
import { executeWithKeyRotation } from './gemini-key-provider';

// ============================================================
// Text-to-speech provider implementation behind
// the ITextToSpeechService port — سكرتير يرد بصوته (BRD §43).
//
// Uses Gemini TTS model (gemini-2.5-flash-preview-tts) via the
// generateContent REST endpoint with responseModalities: ["AUDIO"].
// The model returns raw PCM (audio/L16, 24 kHz, 16-bit mono) which
// we wrap in a WAV header so the browser can play it directly.
// ============================================================

const MAX_TTS_CHARS = 1000;
const DEFAULT_VOICE = 'Kore';
const SAMPLE_RATE = 24000;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;

/**
 * Wrap raw PCM bytes in a standard WAV header.
 * Input: base64-encoded PCM data (16-bit LE mono @ 24 kHz).
 * Output: base64-encoded WAV file.
 */
function pcmToWavBase64(pcmBase64: string): string {
  const pcmBytes = Buffer.from(pcmBase64, 'base64');
  const dataSize = pcmBytes.length;
  const byteRate = SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE / 8);
  const blockAlign = NUM_CHANNELS * (BITS_PER_SAMPLE / 8);

  // WAV header = 44 bytes
  const header = Buffer.alloc(44);

  // RIFF chunk descriptor
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);

  // fmt sub-chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // sub-chunk size (PCM)
  header.writeUInt16LE(1, 20);  // audio format = 1 (PCM)
  header.writeUInt16LE(NUM_CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);

  // data sub-chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  const wavBuffer = Buffer.concat([header, pcmBytes]);
  return wavBuffer.toString('base64');
}

async function synthesizeGemini(
  text: string,
  apiKey: string
): Promise<{ audioBase64: string; mimeType: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        parts: [{ text }],
      },
    ],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: DEFAULT_VOICE,
          },
        },
      },
    },
  };

  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini TTS error ${res.status}: ${errText}`);
      }

      const data = await res.json();

      // Audio data is in candidates[0].content.parts[0].inlineData
      const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!inlineData?.data) {
        throw new Error('No audio data in Gemini TTS response');
      }

      // Gemini returns raw PCM (audio/L16;codec=pcm;rate=24000).
      // We need to wrap it in a WAV header for browser playback.
      const rawMime: string = inlineData.mimeType || '';
      const isRawPcm = rawMime.includes('L16') || rawMime.includes('pcm');

      if (isRawPcm) {
        return {
          audioBase64: pcmToWavBase64(inlineData.data),
          mimeType: 'audio/wav',
        };
      }

      // If it's already a playable format, return as-is
      return {
        audioBase64: inlineData.data,
        mimeType: inlineData.mimeType || 'audio/wav',
      };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }

  throw lastErr || new Error('Gemini TTS call failed after retries');
}

export class ZaiTextToSpeechService implements ITextToSpeechService {
  async synthesize(text: string): Promise<{ audioBase64: string; mimeType: string }> {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_TTS_CHARS);
    if (!clean) throw new Error('empty tts text');

    return executeWithKeyRotation((key) => synthesizeGemini(clean, key));
  }
}
