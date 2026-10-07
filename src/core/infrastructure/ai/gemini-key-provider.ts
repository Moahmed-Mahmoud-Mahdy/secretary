/**
 * Helper to retrieve Gemini API keys.
 * Supports comma-separated keys in GEMINI_API_KEY or GOOGLE_AI_API_KEY
 * for automatic rotation and failover.
 */
export function getGeminiApiKeys(): string[] {
  const raw = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
  return raw
    .split(',')
    .map((k) => k.replace(/^["']|["']$/g, '').trim())
    .filter((k) => k.length > 0);
}

/**
 * Executes a Gemini API call function with key rotation on rate limits (429),
 * quota exhaustion, or temporary errors.
 */
export async function executeWithKeyRotation<T>(
  action: (apiKey: string) => Promise<T>
): Promise<T> {
  const keys = getGeminiApiKeys();
  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEY is not configured in environment variables');
  }

  let lastError: Error | null = null;
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    try {
      return await action(key);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;
      const isQuotaError =
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('Quota') ||
        msg.includes('quota') ||
        msg.includes('API key');

      if (i < keys.length - 1) {
        if (isQuotaError) {
          console.warn(`[Gemini Key Rotation] Key index ${i} rate-limited. Failover to key index ${i + 1}...`);
        } else {
          console.warn(`[Gemini Key Rotation] Request error with key index ${i}. Failover to key index ${i + 1}...`);
        }
        continue;
      }
    }
  }

  throw lastError || new Error('All Gemini API keys failed');
}
