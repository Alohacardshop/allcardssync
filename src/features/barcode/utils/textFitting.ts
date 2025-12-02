// Text fitting utilities for auto-sizing text in label boxes

/**
 * Measure text width using canvas
 */
export function measureTextWidth(
  text: string,
  fontSize: number,
  fontFamily: string = 'monospace'
): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return text.length * fontSize * 0.6;
  
  ctx.font = `${fontSize}px ${fontFamily}`;
  return ctx.measureText(text).width;
}

/**
 * Calculate optimal font size for text to fit in a box
 */
export function calculateOptimalFontSize(
  text: string,
  boxWidth: number,
  maxFontSize: number,
  minFontSize: number,
  fontFamily: string = 'monospace'
): { fontSize: number; lines: string[]; isTwoLine: boolean } {
  if (!text || text.trim().length === 0) {
    return { fontSize: maxFontSize, lines: [''], isTwoLine: false };
  }

  const trimmedText = text.trim();
  
  // Try single line first, starting from max font size
  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 2) {
    const width = measureTextWidth(trimmedText, fontSize, fontFamily);
    if (width <= boxWidth) {
      return { fontSize, lines: [trimmedText], isTwoLine: false };
    }
  }
  
  // If single line doesn't fit at min font size, try two lines
  const words = trimmedText.split(/\s+/);
  if (words.length >= 2) {
    // Find the best split point (roughly half the text length)
    const midPoint = Math.ceil(words.length / 2);
    const line1 = words.slice(0, midPoint).join(' ');
    const line2 = words.slice(midPoint).join(' ');
    
    // Try to fit both lines
    for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 2) {
      const width1 = measureTextWidth(line1, fontSize, fontFamily);
      const width2 = measureTextWidth(line2, fontSize, fontFamily);
      
      if (width1 <= boxWidth && width2 <= boxWidth) {
        return { fontSize, lines: [line1, line2], isTwoLine: true };
      }
    }
    
    // If still doesn't fit, use minimum font size with truncation
    return { 
      fontSize: minFontSize, 
      lines: [truncateText(line1, boxWidth, minFontSize), truncateText(line2, boxWidth, minFontSize)], 
      isTwoLine: true 
    };
  }
  
  // Single word that doesn't fit - truncate
  return { 
    fontSize: minFontSize, 
    lines: [truncateText(trimmedText, boxWidth, minFontSize)], 
    isTwoLine: false 
  };
}

/**
 * Truncate text to fit within a given width
 */
function truncateText(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontFamily: string = 'monospace'
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
