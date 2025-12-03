// Text fitting utilities for auto-sizing text in label boxes

/**
 * Measure text width using canvas
 */
export function measureTextWidth(
  text: string,
  fontSize: number,
  fontFamily: string = 'sans-serif'
): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return text.length * fontSize * 0.6;
  
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  return ctx.measureText(text).width;
}

/**
 * Calculate the MAXIMUM font size that fits text on a single line
 */
function getMaxSingleLineFontSize(
  text: string,
  boxWidth: number,
  maxFontSize: number,
  minFontSize: number,
  fontFamily: string = 'sans-serif'
): number {
  if (!text) return maxFontSize;
  
  // Binary search for optimal font size
  let low = minFontSize;
  let high = maxFontSize;
  let bestFit = minFontSize;
  
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const width = measureTextWidth(text, mid, fontFamily);
    
    if (width <= boxWidth) {
      bestFit = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  
  return bestFit;
}

/**
 * Find best 2-line split and maximum font size for title text
 */
function getBestTwoLineSplit(
  text: string,
  boxWidth: number,
  boxHeight: number,
  maxFontSize: number,
  minFontSize: number,
  fontFamily: string = 'sans-serif'
): { fontSize: number; lines: string[] } {
  const words = text.trim().split(/\s+/);
  
  if (words.length < 2) {
    // Single word - can't split, just return single line
    const fontSize = getMaxSingleLineFontSize(text, boxWidth, maxFontSize, minFontSize, fontFamily);
    return { fontSize, lines: [text.trim()] };
  }
  
  let bestResult = { fontSize: minFontSize, lines: [text.trim()] };
  
  // Try all possible split points
  for (let splitIdx = 1; splitIdx < words.length; splitIdx++) {
    const line1 = words.slice(0, splitIdx).join(' ');
    const line2 = words.slice(splitIdx).join(' ');
    
    // Find max font that fits both lines
    const maxFont1 = getMaxSingleLineFontSize(line1, boxWidth, maxFontSize, minFontSize, fontFamily);
    const maxFont2 = getMaxSingleLineFontSize(line2, boxWidth, maxFontSize, minFontSize, fontFamily);
    const splitFontSize = Math.min(maxFont1, maxFont2);
    
    // Check if 2 lines fit in the box height (with some padding)
    const lineHeight = splitFontSize * 1.1;
    const totalHeight = lineHeight * 2;
    
    if (totalHeight <= boxHeight && splitFontSize > bestResult.fontSize) {
      bestResult = { fontSize: splitFontSize, lines: [line1, line2] };
    }
  }
  
  return bestResult;
}

interface FitResult {
  fontSize: number;
  lines: string[];
  isTwoLine: boolean;
}

/**
 * Calculate optimal font size for text to fit in a box
 * Maximizes font size, using 2 lines if it results in larger text
 */
export function calculateOptimalFontSize(
  text: string,
  boxWidth: number,
  maxFontSize: number,
  minFontSize: number,
  fontFamily: string = 'sans-serif',
  allowTwoLines: boolean = false,
  boxHeight: number = 0
): FitResult {
  if (!text || text.trim().length === 0) {
    return { fontSize: maxFontSize, lines: [''], isTwoLine: false };
  }

  const trimmedText = text.trim();
  
  // Get best single-line font size
  const singleLineFontSize = getMaxSingleLineFontSize(trimmedText, boxWidth, maxFontSize, minFontSize, fontFamily);
  
  // If 2 lines not allowed, return single line result
  if (!allowTwoLines) {
    if (singleLineFontSize >= minFontSize) {
      return { fontSize: singleLineFontSize, lines: [trimmedText], isTwoLine: false };
    }
    // Text doesn't fit, truncate
    return { 
      fontSize: minFontSize, 
      lines: [truncateText(trimmedText, boxWidth, minFontSize, fontFamily)], 
      isTwoLine: false 
    };
  }
  
  // For title (allowTwoLines=true), compare single vs two line options
  const twoLineResult = getBestTwoLineSplit(trimmedText, boxWidth, boxHeight, maxFontSize, minFontSize, fontFamily);
  
  // Use 2 lines if it results in a larger or equal font size
  if (twoLineResult.lines.length === 2 && twoLineResult.fontSize >= singleLineFontSize) {
    return { fontSize: twoLineResult.fontSize, lines: twoLineResult.lines, isTwoLine: true };
  }
  
  // Otherwise use single line
  if (singleLineFontSize >= minFontSize) {
    return { fontSize: singleLineFontSize, lines: [trimmedText], isTwoLine: false };
  }
  
  // Fallback: try 2 lines even if smaller font
  if (twoLineResult.fontSize >= minFontSize) {
    return { fontSize: twoLineResult.fontSize, lines: twoLineResult.lines, isTwoLine: true };
  }
  
  // Last resort: truncate
  return { 
    fontSize: minFontSize, 
    lines: [truncateText(trimmedText, boxWidth, minFontSize, fontFamily)], 
    isTwoLine: false 
  };
}

/**
 * Calculate font size for title field - always tries 2 lines for better fit
 */
export function calculateTitleFontSize(
  text: string,
  boxWidth: number,
  boxHeight: number,
  maxFontSize: number,
  minFontSize: number,
  fontFamily: string = 'sans-serif'
): FitResult {
  return calculateOptimalFontSize(text, boxWidth, maxFontSize, minFontSize, fontFamily, true, boxHeight);
}

/**
 * Truncate text to fit within a given width
 */
function truncateText(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontFamily: string = 'sans-serif'
): string {
  let truncated = text;
  while (truncated.length > 1 && measureTextWidth(truncated + '…', fontSize, fontFamily) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated.length < text.length ? truncated + '…' : text;
}

/**
 * Convert dots to pixels for screen display (scaled)
 */
export function dotsToPixels(dots: number, scale: number = 2): number {
  return dots * scale;
}

/**
 * Convert pixels to dots for layout storage
 */
export function pixelsToDots(pixels: number, scale: number = 2): number {
  return Math.round(pixels / scale);
}
