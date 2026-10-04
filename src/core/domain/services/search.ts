// ============================================================
// Arabic-aware text matching for global search (BRD §43 —
// productivity helpers). Users type Egyptian Arabic quickly:
// hamza variants (أ إ آ), taa marbuta (ة), alef maqsura (ى)
// and diacritics must not break matching.
// ============================================================

/** Diacritics (tashkeel) + Quranic annotation + tatweel. */
const STRIP_PATTERN = /[\u064B-\u0660\u066D-\u0670\u0640]/g;

/**
 * Normalize Arabic/Latin text so fuzzy user queries match stored data:
 * - strips diacritics & tatweel
 * - أ/إ/آ → ا ، ة → ه ، ى → ي ، ؤ → و ، ئ → ي ، ء kept
 * - lowercase Latin, collapse whitespace
 */
export function normalizeArabic(input: string): string {
  if (!input) return '';
  return input
    .normalize('NFC')
    .replace(STRIP_PATTERN, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/([بْ]?)/g, '$1') // no-op guard, keeps intent explicit
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[A-Z]/g, (c) => c.toLowerCase())
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when every whitespace-separated token of `query` occurs in `haystack`. */
export function matchesQuery(haystack: string | null | undefined, query: string): boolean {
  const normHay = normalizeArabic(haystack ?? '');
  if (!normHay) return false;
  const tokens = normalizeArabic(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every((t) => normHay.includes(t));
}
