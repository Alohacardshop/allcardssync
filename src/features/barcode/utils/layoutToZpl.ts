// Convert label layout to ZPL code

import type { LabelLayout, LabelField, SampleData, FieldKey } from '../types/labelLayout';
import { CHAR_W_RATIO, estimateCode128WidthDots } from '@/lib/zplFit';
import { calculateOptimalFontSize, calculateTitleFontSize } from './textFitting';

// Same calibration factor used in preview (FieldBoxEnhanced.tsx)
const FONT_CALIBRATION_FACTOR = 0.65;
const PREVIEW_SCALE = 2;

interface ZplGeneratorOptions {
  dpi?: 203 | 300;
  copies?: number;
  speed?: number;
  darkness?: number;
}

/**
 * Generate ZPL code from a label layout and data
 */
export function generateZplFromLayout(
  layout: LabelLayout,
  data: SampleData,
  options: ZplGeneratorOptions = {}
): string {
  const { dpi = 203, copies = 1, speed = 4, darkness = 10 } = options;
  
  const lines: string[] = [
    '^XA', // Start format
    '^CI28', // UTF-8 encoding
    `^PW${layout.widthDots}`, // Print width
    `^LL${layout.heightDots}`, // Label length
    `^PR${speed}`, // Print speed
    `^MD${darkness}`, // Media darkness
    '^MNY', // Gap/notch mode (label with gaps)
    '^LH0,0', // Label home position
    `^LT${layout.labelTopOffset || 0}`, // Label top offset
    `^LS${layout.labelLeftOffset || 0}`, // Label shift (left/right)
  ];

  // Sort fields by y position for consistent rendering
  const enabledFields = layout.fields
    .filter(f => f.enabled)
    .sort((a, b) => a.y - b.y);

  for (const field of enabledFields) {
    const value = data[field.fieldKey] || '';
    if (!value) continue;

    if (field.fieldKey === 'barcode') {
      // Generate barcode
      lines.push(...generateBarcodeZpl(field, value));
    } else {
      // Generate text field - enable two-line handling for title and condition
      const allowTwoLines = field.fieldKey === 'title' || field.fieldKey === 'condition';
      lines.push(...generateTextZpl(field, value, allowTwoLines));
    }
  }

  // Add quantity and end
  lines.push(`^PQ${copies}`);
  lines.push('^XZ');

  return lines.join('\n');
}

/**
 * Generate ZPL template with placeholders
 */
export function generateZplTemplate(layout: LabelLayout): string {
  const lines: string[] = [
    '^XA',
    '^CI28',
    `^PW${layout.widthDots}`,
    `^LL${layout.heightDots}`,
    '^PR{{SPEED}}',
    '^MD{{DARKNESS}}',
    '^MNY',
    '^LH0,0',
    `^LT${layout.labelTopOffset || 0}`,
    `^LS${layout.labelLeftOffset || 0}`,
  ];

  const enabledFields = layout.fields
    .filter(f => f.enabled)
    .sort((a, b) => a.y - b.y);

  for (const field of enabledFields) {
    const placeholder = `{{${fieldKeyToPlaceholder(field.fieldKey)}}}`;
    
    if (field.fieldKey === 'barcode') {
      lines.push(...generateBarcodeZpl(field, placeholder));
    } else {
      // Enable two-line handling for title and condition
      const allowTwoLines = field.fieldKey === 'title' || field.fieldKey === 'condition';
      lines.push(...generateTextZpl(field, placeholder, allowTwoLines));
    }
  }

  lines.push('^PQ{{COPIES}}');
  lines.push('^XZ');

  return lines.join('\n');
}

/**
 * Apply letter spacing to text by inserting spaces between characters
 * Skip if text contains template placeholders (e.g., {{PRICE}})
 */
function applyLetterSpacing(text: string, spacing: number): string {
  if (!spacing || spacing <= 0) return text;
  // Don't apply to template placeholders - they need to stay intact for replacement
  if (text.includes('{{')) return text;
  const spacer = ' '.repeat(spacing);
  return text.split('').join(spacer);
}

/**
 * Apply spacing specifically for price fields (always space out numbers)
 */
function formatPriceWithSpacing(text: string): string {
  // Don't apply to template placeholders
  if (text.includes('{{')) return text;
  // Add single space between each character for price readability
  return text.split('').join(' ');
}

/**
 * Generate text field ZPL using same Canvas-based fitting as preview
 */
function generateTextZpl(field: LabelField, text: string, isTitle: boolean = false): string[] {
  const lines: string[] = [];
  const justification = field.alignment === 'center' ? 'C' : field.alignment === 'right' ? 'R' : 'L';
  
  // Convert dots to screen pixels (same as preview does)
  const pixelWidth = field.width * PREVIEW_SCALE;
  const pixelHeight = field.height * PREVIEW_SCALE;
  const maxFontPixels = field.maxFontSize * PREVIEW_SCALE * FONT_CALIBRATION_FACTOR;
  const minFontPixels = field.minFontSize * PREVIEW_SCALE * FONT_CALIBRATION_FACTOR;
  
  // Use the same Canvas-based calculation as the preview
  const result = isTitle
    ? calculateTitleFontSize(text, pixelWidth, pixelHeight, maxFontPixels, minFontPixels)
    : calculateOptimalFontSize(text, pixelWidth, maxFontPixels, minFontPixels);
  
  // Convert pixel font size back to ZPL dots
  const fontSizeDots = Math.round(result.fontSize / PREVIEW_SCALE / FONT_CALIBRATION_FACTOR);
  const clampedFontSize = Math.max(field.minFontSize, Math.min(fontSizeDots, field.maxFontSize));
  const fontWidth = Math.floor(clampedFontSize * CHAR_W_RATIO);
  
  const letterSpacing = field.letterSpacing || 0;
  
  // Apply formatting based on field type
  const formatText = (t: string) => {
    // Price field always gets spacing for better readability
    if (field.fieldKey === 'price') {
      return formatPriceWithSpacing(t);
    }
    return applyLetterSpacing(t, letterSpacing);
  };
  
  lines.push(`^FO${field.x},${field.y}`);
  lines.push(`^A0N,${clampedFontSize},${fontWidth}`);
  
  // For title/condition fields (isTitle=true), ALWAYS use 2-line field block
  // This ensures actual data at print time has room to wrap, even though
  // placeholder text may have fit on 1 line during template generation
  if (isTitle) {
    lines.push(`^FB${field.width},2,0,${justification}`);
    // Use line break if text was split, otherwise let printer wrap as needed
    if (result.isTwoLine && result.lines.length === 2) {
      const line1 = formatText(result.lines[0]);
      const line2 = formatText(result.lines[1]);
      lines.push(`^FD${escapeZplText(line1 + '\\&' + line2)}^FS`);
    } else {
      lines.push(`^FD${escapeZplText(formatText(text))}^FS`);
    }
  } else {
    // Non-title fields: single line only
    if (field.alignment !== 'left') {
      lines.push(`^FB${field.width},1,0,${justification}`);
    }
    lines.push(`^FD${escapeZplText(formatText(text))}^FS`);
  }
  
  return lines;
}

/**
 * Generate barcode ZPL (Code 128)
 */
function generateBarcodeZpl(field: LabelField, data: string): string[] {
  const lines: string[] = [];
  
  // Calculate module width for barcode to fit
  const barcodeData = data.replace(/[{}]/g, ''); // Remove placeholder braces for estimation
  const moduleWidth = Math.max(2, Math.min(4, Math.floor(field.width / (barcodeData.length * 11 + 35))));
  const barcodeHeight = field.height - 4; // Use nearly full height (no human-readable text)
  
  // Center the barcode in the field
  const estimatedBarcodeWidth = estimateCode128WidthDots(barcodeData.length, moduleWidth);
  const xOffset = field.alignment === 'center' 
    ? Math.max(0, Math.floor((field.width - estimatedBarcodeWidth) / 2))
    : field.alignment === 'right'
    ? Math.max(0, field.width - estimatedBarcodeWidth)
    : 0;
  
  // Field origin
  lines.push(`^FO${field.x + xOffset},${field.y}`);
  
  // Barcode parameters
  lines.push(`^BY${moduleWidth}`);
  
  // Code 128 barcode without human-readable text (cleaner look, more height)
  lines.push(`^BCN,${barcodeHeight},N,N,N`);
  
  // Field data
  lines.push(`^FD${escapeZplText(data)}^FS`);
  
  return lines;
}

/**
 * Convert field key to ZPL placeholder name
 */
function fieldKeyToPlaceholder(fieldKey: FieldKey): string {
  const mapping: Record<FieldKey, string> = {
    title: 'CARDNAME',
    sku: 'SKU',
    price: 'PRICE',
    condition: 'CONDITION',
    barcode: 'BARCODE',
    set: 'SETNAME',
    cardNumber: 'CARDNUMBER',
    year: 'YEAR',
    vendor: 'VENDOR',
  };
  return mapping[fieldKey] || fieldKey.toUpperCase();
}

/**
 * Escape special ZPL characters using proper ZPL hex codes
 */
function escapeZplText(text: string): string {
  return text
    .replace(/\^/g, '^5E')
    .replace(/~/g, '^7E');
}

/**
 * Fill ZPL template with actual data
 */
export function fillZplTemplate(template: string, data: SampleData, options: { copies?: number; speed?: number; darkness?: number } = {}): string {
  let filled = template;
  
  // Replace field placeholders
  filled = filled.replace(/{{CARDNAME}}/g, data.title || '');
  filled = filled.replace(/{{SKU}}/g, data.sku || '');
  filled = filled.replace(/{{PRICE}}/g, formatPriceWithSpacing(data.price || ''));
  filled = filled.replace(/{{CONDITION}}/g, data.condition || '');
  filled = filled.replace(/{{BARCODE}}/g, data.barcode || data.sku || '');
  filled = filled.replace(/{{SETNAME}}/g, data.set || '');
  filled = filled.replace(/{{CARDNUMBER}}/g, data.cardNumber || '');
  filled = filled.replace(/{{YEAR}}/g, data.year || '');
  filled = filled.replace(/{{VENDOR}}/g, data.vendor || '');
  
  // Replace settings placeholders
  filled = filled.replace(/{{COPIES}}/g, String(options.copies ?? 1));
  filled = filled.replace(/{{SPEED}}/g, String(options.speed ?? 4));
  filled = filled.replace(/{{DARKNESS}}/g, String(options.darkness ?? 10));
  
  return filled;
}
