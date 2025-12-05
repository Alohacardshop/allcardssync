/**
 * Shared ZPL Formatting Helpers
 * Single source of truth for all text formatting used in ZPL generation
 */

/**
 * Format price with spacing between characters for better readability on labels
 * e.g., "$350.00" -> "$ 3 5 0 . 0 0"
 */
export function formatPriceWithSpacing(value: string): string {
  if (!value) return '';
  // Don't apply to template placeholders
  if (value.includes('{{')) return value;
  return value.split('').join(' ');
}

/**
 * Format title text (trim whitespace)
 */
export function formatTitle(value: string): string {
  if (!value) return '';
  return value.trim();
}

/**
 * Format condition text (trim whitespace)
 */
export function formatCondition(value: string): string {
  if (!value) return '';
  return value.trim();
}

/**
 * Apply letter spacing to text by inserting spaces between characters
 * Skip if text contains template placeholders (e.g., {{PRICE}})
 */
export function applyLetterSpacing(text: string, spacing: number): string {
  if (!spacing || spacing <= 0) return text;
  // Don't apply to template placeholders - they need to stay intact for replacement
  if (text.includes('{{')) return text;
  const spacer = ' '.repeat(spacing);
  return text.split('').join(spacer);
}

/**
 * Escape special ZPL characters using proper ZPL hex codes
 */
export function escapeZplText(text: string): string {
  return text
    .replace(/\^/g, '^5E')
    .replace(/~/g, '^7E');
}

/**
 * Safe string helper - returns empty string for undefined/null
 */
export function safe(value: string | undefined | null): string {
  return value ?? '';
}
