/**
 * T32 — Confirmation keyword resolver.
 *
 * Pure function: maps user input text to a confirmation resolution action.
 * No dependencies, no side effects.
 *
 * Priority order (important for ambiguous input like "sí, pero cambiá"):
 *   1. Edit keywords (highest — user wants to modify the draft)
 *   2. Cancel keywords
 *   3. Confirm keywords
 *   4. Unknown (no match)
 */

export type ConfirmationResolution = {
  action: "confirm" | "cancel" | "edit" | "unknown";
  matchedKeyword: string | null;
};

// Keyword tables — checked in priority order
const EDIT_KEYWORDS = ["cambi", "cambiá", "edita", "editá", "corregi", "corregí", "modificá", "mejor decile", "mejor dile", "poné"];
const CANCEL_KEYWORDS = ["mejor no", "no lo mandes", "cancelar", "cancelá", "cancela", "espera", "esperá", "no"];
const CONFIRM_KEYWORDS = ["mandalo ya", "mandalo", "envialo ya", "envialo", "dale que sí", "confirmo", "mandale", "dale", "sí", "si", "ok"];

/**
 * Resolves user input text to a confirmation action.
 *
 * Edit intent takes priority over confirmation (E3 from spec).
 * Matching is case-insensitive and works with embedded keywords.
 * Short keywords (≤2 chars) use word-boundary matching to avoid
 * false positives (e.g., "no" should not match inside "bueno").
 */
export function resolveConfirmationInput(text: string): ConfirmationResolution {
  const normalized = text.trim().toLowerCase();
  if (normalized.length === 0) {
    return { action: "unknown", matchedKeyword: null };
  }

  // Check edit keywords first (highest priority)
  for (const keyword of EDIT_KEYWORDS) {
    if (keywordMatches(normalized, keyword.toLowerCase())) {
      const matched = findOriginalCaseMatch(text, keyword);
      return { action: "edit", matchedKeyword: matched };
    }
  }

  // Check cancel keywords
  for (const keyword of CANCEL_KEYWORDS) {
    if (keywordMatches(normalized, keyword.toLowerCase())) {
      const matched = findOriginalCaseMatch(text, keyword);
      return { action: "cancel", matchedKeyword: matched };
    }
  }

  // Check confirm keywords
  for (const keyword of CONFIRM_KEYWORDS) {
    if (keywordMatches(normalized, keyword.toLowerCase())) {
      const matched = findOriginalCaseMatch(text, keyword);
      return { action: "confirm", matchedKeyword: matched };
    }
  }

  return { action: "unknown", matchedKeyword: null };
}

/**
 * Checks if a keyword matches in the text.
 * Short keywords (≤2 chars) require exact match or word boundary to avoid
 * false positives (e.g., "no" should not match inside "bueno").
 */
function keywordMatches(text: string, keyword: string): boolean {
  if (keyword.length <= 2) {
    // Exact match for very short keywords
    if (text === keyword) return true;
    // Word boundary: keyword at start followed by non-letter, or at end preceded by non-letter,
    // or surrounded by non-letters
    const beforeOk = text.startsWith(keyword) && (text.length === keyword.length || !isLetterChar(text[keyword.length]!));
    const afterOk = text.endsWith(keyword) && (text.length === keyword.length || !isLetterChar(text[text.length - keyword.length - 1]!));
    if (beforeOk || afterOk) return true;
    // Check for keyword surrounded by non-letter chars
    const idx = text.indexOf(keyword);
    if (idx === -1) return false;
    const hasBefore = idx === 0 || !isLetterChar(text[idx - 1]!);
    const hasAfter = idx + keyword.length === text.length || !isLetterChar(text[idx + keyword.length]!);
    return hasBefore && hasAfter;
  }
  return text.includes(keyword);
}

/** Returns true if the character is a letter (including accented chars). */
function isLetterChar(ch: string): boolean {
  return /[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/.test(ch);
}

/**
 * Finds the original-case substring in the text that matches the keyword.
 * Returns the first matching substring from the original text.
 */
function findOriginalCaseMatch(text: string, keyword: string): string {
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const index = lowerText.indexOf(lowerKeyword);
  if (index === -1) return keyword;
  return text.substring(index, index + keyword.length);
}
