// Convert label layout to ZPL code

import type { LabelLayout, LabelField, SampleData, FieldKey } from '../types/labelLayout';
import { CHAR_W_RATIO, fitFontSingleLine, estimateCode128WidthDots } from '@/lib/zplFit';

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
      // Generate text field - pass isTitle flag for smart two-line handling
      lines.push(...generateTextZpl(field, value, field.fieldKey === 'title'));
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
      lines.push(...generateTextZpl(field, placeholder, field.fieldKey === 'title'));
    }
  }

  lines.push('^PQ{{COPIES}}');
  lines.push('^XZ');

  return lines.join('\n');
}

/**
 * Generate text field ZPL using same smart fitting as preview
 */
function generateTextZpl(field: LabelField, text: string, isTitle: boolean = false): string[] {
  const lines: string[] = [];
  const justification = field.alignment === 'center' ? 'C' : field.alignment === 'right' ? 'R' : 'L';
  
  // For title fields, try to maximize font using two lines if beneficial
  if (isTitle && text.includes(' ')) {
    // First check single-line fit
    const singleLineFontSize = fitFontSingleLine(text, field.width, field.maxFontSize, field.minFontSize);
    
    // Check if two lines would allow a larger font
    const words = text.split(' ');
    let bestTwoLineFont = 0;
    let bestSplitIndex = -1;
    
    // Try each possible split point
    for (let i = 1; i < words.length; i++) {
      const line1 = words.slice(0, i).join(' ');
      const line2 = words.slice(i).join(' ');
      const longerLine = line1.length > line2.length ? line1 : line2;
      
      // Font that fits the longer line
      const fontForWidth = fitFontSingleLine(longerLine, field.width, field.maxFontSize, field.minFontSize);
      // Font constrained by height (2 lines with ~1.2 line height)
      const fontForHeight = Math.floor(field.height / 2.4);
      const twoLineFont = Math.min(fontForWidth, fontForHeight, field.maxFontSize);
      
      if (twoLineFont > bestTwoLineFont) {
        bestTwoLineFont = twoLineFont;
        bestSplitIndex = i;
      }
    }
    
    lines.push(`^FO${field.x},${field.y}`);
    
    // Use two lines if it gives us a bigger font
    if (bestTwoLineFont > singleLineFontSize && bestSplitIndex > 0) {
      const line1 = words.slice(0, bestSplitIndex).join(' ');
      const line2 = words.slice(bestSplitIndex).join(' ');
      const fontSizeDots = Math.max(field.minFontSize, Math.min(bestTwoLineFont, field.maxFontSize));
      const fontWidth = Math.floor(fontSizeDots * CHAR_W_RATIO);
      
      lines.push(`^FB${field.width},2,0,${justification}`);
      lines.push(`^A0N,${fontSizeDots},${fontWidth}`);
      lines.push(`^FD${escapeZplText(line1 + '\\&' + line2)}^FS`);
    } else {
      // Single line is better or equal
      const fontSizeDots = Math.max(field.minFontSize, Math.min(singleLineFontSize, field.maxFontSize));
      const fontWidth = Math.floor(fontSizeDots * CHAR_W_RATIO);
      
      if (field.alignment !== 'left') {
        lines.push(`^FB${field.width},1,0,${justification}`);
      }
      lines.push(`^A0N,${fontSizeDots},${fontWidth}`);
      lines.push(`^FD${escapeZplText(text)}^FS`);
    }
  } else {
    // Non-title fields: maximize font for single line
    const fontSize = fitFontSingleLine(text, field.width, field.maxFontSize, field.minFontSize);
    
    lines.push(`^FO${field.x},${field.y}`);
    if (field.alignment !== 'left') {
      lines.push(`^FB${field.width},1,0,${justification}`);
    }
    lines.push(`^A0N,${fontSize},${Math.floor(fontSize * CHAR_W_RATIO)}`);
    lines.push(`^FD${escapeZplText(text)}^FS`);
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
  filled = filled.replace(/{{PRICE}}/g, data.price || '');
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
