// Conservative width ratio for ZPL font 0 (^A0) at 203 dpi.
// Wider glyphs ($, 9, ,) push real width; 0.62 is a good field-tested value.
export const CHAR_W_RATIO = 0.62;

/** Largest ^A0N,h,w that fits a SINGLE LINE in boxWidthDots. */
export function fitFontSingleLine(
  text: string,
  boxWidthDots: number,
  maxH: number,
  minH = 16
): number {
  const t = (text ?? "").trim();
  if (!t) return minH;

  let h = Math.min(
    maxH,
    Math.floor(boxWidthDots / Math.max(1, t.length * CHAR_W_RATIO))
  );

  while (h > minH) {
    const est = t.length * (h * CHAR_W_RATIO);
    if (est <= boxWidthDots) break;
    h--;
  }
  return Math.max(minH, Math.min(h, maxH));
}

/**
 * Very rough Code128 width estimate in dots for planning/centering.
 * Assumes ~11 narrow modules per character average + guards (~35 modules).
 * moduleDots = ^BY "w" value (e.g., 2 or 3 at 203 dpi).
 */
export function estimateCode128WidthDots(len: number, moduleDots: number): number {
  const modules = Math.max(0, len) * 11 + 35; // heuristic
  return modules * Math.max(1, moduleDots);
}