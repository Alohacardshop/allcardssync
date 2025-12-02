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
    '^LT0', // Label top
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
      // Generate text field
      lines.push(...generateTextZpl(field, value));
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
    '^LT0',
  ];

  const enabledFields = layout.fields
    .filter(f => f.enabled)
    .sort((a, b) => a.y - b.y);

  for (const field of enabledFields) {
    const placeholder = `{{${fieldKeyToPlaceholder(field.fieldKey)}}}`;
    
    if (field.fieldKey === 'barcode') {
      lines.push(...generateBarcodeZpl(field, placeholder));
    } else {
      lines.push(...generateTextZpl(field, placeholder));
    }
  }

  lines.push('^PQ{{COPIES}}');
  lines.push('^XZ');

  return lines.join('\n');
}

/**
 * Generate text field ZPL
 */
function generateTextZpl(field: LabelField, text: string): string[] {
  const lines: string[] = [];
  
  // Calculate font size based on text length
  const fontSize = fitFontSingleLine(text, field.width, field.maxFontSize, field.minFontSize);
  
  // Check if we need two lines
  const estimatedWidth = text.length * fontSize * CHAR_W_RATIO;
  const needsTwoLines = estimatedWidth > field.width && text.includes(' ');
  
  // Field origin
  lines.push(`^FO${field.x},${field.y}`);
  
  // Text block with alignment
  const justification = field.alignment === 'center' ? 'C' : field.alignment === 'right' ? 'R' : 'L';
  
  if (needsTwoLines) {
    // Use field block for multi-line
    const lineHeight = Math.ceil(fontSize * 1.2);
    lines.push(`^FB${field.width},2,0,${justification}`);
    lines.push(`^A0N,${Math.floor(fontSize * 0.85)},${Math.floor(fontSize * 0.85 * CHAR_W_RATIO)}`);
  } else {
    // Single line
    if (field.alignment !== 'left') {
      lines.push(`^FB${field.width},1,0,${justification}`);
    }
    lines.push(`^A0N,${fontSize},${Math.floor(fontSize * CHAR_W_RATIO)}`);
  }
  
  // Field data
  lines.push(`^FD${escapeZplText(text)}^FS`);
  
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
  const barcodeHeight = Math.min(field.height - 20, 60); // Leave room for human-readable text
  
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
  
  // Code 128 barcode with human-readable text below
  lines.push(`^BCN,${barcodeHeight},Y,N,N`);
  
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
 * Escape special ZPL characters
 */
function escapeZplText(text: string): string {
  return text
    .replace(/\^/g, '_5E')
    .replace(/~/g, '_7E');
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
