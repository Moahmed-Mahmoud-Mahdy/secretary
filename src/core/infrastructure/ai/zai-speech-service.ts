import type { ISpeechToTextService } from '../../application/ports';
import { executeWithKeyRotation } from './gemini-key-provider';

// ============================================================
// Speech-to-text provider implementation (Google Gemini ASR) behind
// the ISpeechToTextService port (BRD §5.2 voice input).
// ============================================================

async function transcribeGemini(audioBase64: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'audio/wav', data: audioBase64 } },
            { text: 'انقل النص المسموع فقط في هذا التسجيل الصوتي بدون أي تعليقات أو علامات تنصيص. اكتب الكلام باللغة العربية بالضبط كما هو مسموع.' },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ASR error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
}

export class ZaiSpeechService implements ISpeechToTextService {
  async transcribe(audioBase64: string): Promise<string> {
    if (!audioBase64 || audioBase64.length < 100) return '';

    try {
      return await executeWithKeyRotation((key) => transcribeGemini(audioBase64, key));
    } catch (e) {
      console.error('ASR error:', e);
      return '';
    }
  }
}
