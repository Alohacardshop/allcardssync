/**
 * Consolidated ZPL Generation Module
 * Single source of truth for all ZPL operations
 */

import type { LabelLayout, ZPLElement, JobVars, PrinterPrefs } from './types';
import { generateCutterCommands, type CutterSettings } from '@/hooks/useCutterSettings';

// ============= ZPL Text Escaping (Proper ZPL Spec) =============

export function escapeZpl(text: string): string {
  return text
    .replace(/\^/g, '^5E')  // Escape ^ character (ZPL spec)
    .replace(/~/g, '^7E')   // Escape ~ character (ZPL spec)
    .replace(/\n/g, '\\&')  // Newline in ZPL
    .replace(/\r/g, '');    // Remove carriage return
}

export function unescapeZpl(text: string): string {
  return text
    .replace(/\^5E/g, '^')
    .replace(/\^7E/g, '~')
    .replace(/\\&/g, '\n');
}

// Simple escape for basic use (strips control chars)
const simpleEscape = (s?: string) => (s ?? '').replace(/\^/g, ' ').replace(/~/g, ' ');
const safe = (s?: string) => s ?? '';

// ============= Font Size Calculation =============

function calculateOptimalFontSize(
  text: string, 
  width: number, 
  height: number, 
  minSize = 8, 
  maxSize = 72
): number {
  const avgCharWidth = 0.6;
  const lineHeight = 1.2;
  
  const maxFontByHeight = Math.floor(height / lineHeight);
  const estimatedTextWidth = text.length * avgCharWidth;
  const maxFontByWidth = estimatedTextWidth > 0 ? Math.floor(width / estimatedTextWidth) : maxSize;
  
  const optimalSize = Math.min(maxFontByHeight, maxFontByWidth);
  return Math.max(minSize, Math.min(maxSize, optimalSize));
}

// ============= Media Command =============

function mediaCommand(m: PrinterPrefs['media']): string {
  if (m === 'blackmark') return '^MNM';
  if (m === 'continuous') return '^MNC';
  return '^MNY'; // gap (default)
}

// ============= Main ZPL Generation from Elements =============

export function zplFromElements(
  layout: LabelLayout, 
  prefs?: PrinterPrefs, 
  cutterSettings?: CutterSettings
): string {
  const lines: string[] = [];
  
  // Header
  lines.push('^XA');
  lines.push('^MTD');  // Direct thermal mode
  lines.push(mediaCommand(prefs?.media ?? 'gap'));
  
  // Cutter setup if enabled
  if (cutterSettings?.enableCutter) {
    const { setupCommands, cutCommand } = generateCutterCommands(cutterSettings);
    setupCommands.forEach(cmd => lines.push(cmd));
    if (cutCommand) lines.push(cutCommand);
  }
  
  // Label dimensions and positioning
  lines.push(`^PW${layout.width}`);
  lines.push(`^LL${layout.height}`);
  lines.push('^LH0,0');
  lines.push(`^LS${prefs?.leftShift ?? 0}`);
  lines.push('^FWN');
  lines.push('^PON');
  lines.push('^CI28');  // UTF-8 encoding
  
  // Printer settings
  if (prefs?.speed !== undefined) lines.push(`^PR${prefs.speed}`);
  if (prefs?.darkness !== undefined) lines.push(`^MD${prefs.darkness}`);

  // Convert elements to ZPL
  for (const el of layout.elements) {
    if (el.type === 'text') {
      const font = el.font ?? '0';
      let h = el.h ?? 30;
      let w = el.w ?? 30;
      let text = el.text || '';
      
      // Truncate if maxWidth specified
      if (el.maxWidth && text.length > 0) {
        const avgCharWidth = (h * 0.6);
        const maxChars = Math.floor(el.maxWidth / avgCharWidth);
        if (text.length > maxChars && maxChars > 3) {
          text = text.substring(0, maxChars - 3) + '...';
        }
      }
      
      // Auto-size font if no explicit size
      if (!el.font && el.w && el.h && text) {
        const optimalSize = calculateOptimalFontSize(text, el.w, el.h);
        h = optimalSize;
        w = Math.floor(optimalSize * 0.6);
      }
      
      lines.push(`^FO${el.x},${el.y}^A${font},${h},${w}^FD${escapeZpl(text)}^FS`);
    } else if (el.type === 'barcode') {
      const h = el.height ?? 52;
      const m = el.moduleWidth ?? 2;
      const hr = el.hr ? 'Y' : 'N';
      lines.push(`^FO${el.x},${el.y}^BY${m},3,${h}^BCN,${h},${hr},N,N^FD${escapeZpl(el.data)}^FS`);
    } else if (el.type === 'line') {
      const t = el.thickness ?? 2;
      const wpx = Math.max(1, Math.abs(el.x2 - el.x));
      const hpx = Math.max(1, Math.abs(el.y2 - el.y));
      lines.push(`^FO${Math.min(el.x, el.x2)},${Math.min(el.y, el.y2)}^GB${wpx},${hpx},${t}^FS`);
    }
  }
  
  // Footer (no ^PQ - handled by print queue for batching)
  lines.push('^XZ');
  return lines.join('\n');
}

// ============= Template Variable Substitution =============

export function zplFromTemplateString(zpl: string, v: JobVars): string {
  return zpl
    .replace(/\{\{CARDNAME\}\}/g, safe(v.CARDNAME))
    .replace(/\{\{SETNAME\}\}/g, safe(v.SETNAME))
    .replace(/\{\{CARDNUMBER\}\}/g, safe(v.CARDNUMBER))
    .replace(/\{\{CONDITION\}\}/g, safe(v.CONDITION))
    .replace(/\{\{PRICE\}\}/g, safe(v.PRICE))
    .replace(/\{\{SKU\}\}/g, safe(v.SKU))
    .replace(/\{\{BARCODE\}\}/g, safe(v.BARCODE))
    .replace(/\{\{VENDOR\}\}/g, safe(v.VENDOR))
    .replace(/\{\{YEAR\}\}/g, safe(v.YEAR))
    .replace(/\{\{CATEGORY\}\}/g, safe(v.CATEGORY));
}

export function applyVariablesToZpl(zpl: string, vars: JobVars): string {
  let result = zpl;
  
  const replacements: [string, string | undefined][] = [
    ['CARDNAME', vars.CARDNAME],
    ['SETNAME', vars.SETNAME],
    ['CARDNUMBER', vars.CARDNUMBER],
    ['CONDITION', vars.CONDITION],
    ['PRICE', vars.PRICE],
    ['SKU', vars.SKU],
    ['BARCODE', vars.BARCODE],
    ['VENDOR', vars.VENDOR],
    ['YEAR', vars.YEAR],
    ['CATEGORY', vars.CATEGORY],
  ];
  
  for (const [key, value] of replacements) {
    if (value) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), escapeZpl(value));
    }
  }
  
  return result;
}

// ============= Quantity Injection =============

/**
 * Injects ^PQ command for copies into ZPL
 * Always adds ^PQ, even for single copies (printer validation)
 */
export function injectQuantityIntoZPL(zpl: string, quantity: number): string {
  const finalQuantity = Math.max(1, quantity);
  
  // Replace existing ^PQ if present
  const existingPQ = zpl.match(/\^PQ\d+/);
  if (existingPQ) {
    return zpl.replace(/\^PQ\d+[,\d\w]*/, `^PQ${finalQuantity}`);
  }
  
  // Insert before ^XZ
  const xzIndex = zpl.lastIndexOf('^XZ');
  if (xzIndex === -1) {
    console.warn('ZPL missing ^XZ command, cannot inject quantity');
    return zpl;
  }
  
  return zpl.substring(0, xzIndex) + `^PQ${finalQuantity}\n^XZ`;
}

// ============= Bidirectional Conversion (Elements <-> ZPL) =============

/**
 * Convert visual editor elements to ZPL string (simplified version)
 */
export function elementsToZpl(layout: LabelLayout, prefs?: PrinterPrefs): string {
  return zplFromElements(layout, prefs);
}

/**
 * Parse ZPL string back to visual editor elements
 */
export function zplToElements(zpl: string): LabelLayout {
  const layout: LabelLayout = {
    dpi: 203,
    width: 406, 
    height: 203,
    elements: []
  };
  
  const lines = zpl.split('\n').map(line => line.trim()).filter(Boolean);
  
  for (const line of lines) {
    // Parse label width
    const pwMatch = line.match(/^\^PW(\d+)/);
    if (pwMatch) {
      layout.width = parseInt(pwMatch[1]);
      continue;
    }
    
    // Parse label height
    const llMatch = line.match(/^\^LL(\d+)/);
    if (llMatch) {
      layout.height = parseInt(llMatch[1]);
      continue;
    }
    
    // Parse text field: ^FO100,50^A0,30,30^FDHello World^FS
    const textMatch = line.match(/^\^FO(\d+),(\d+)\^A([^,]*),(\d+),(\d+)\^FD([^^]*)\^FS/);
    if (textMatch) {
      layout.elements.push({
        type: 'text',
        id: `text_${layout.elements.length}`,
        x: parseInt(textMatch[1]),
        y: parseInt(textMatch[2]),
        font: textMatch[3] || '0',
        h: parseInt(textMatch[4]),
        w: parseInt(textMatch[5]),
        text: unescapeZpl(textMatch[6])
      });
      continue;
    }
    
    // Parse barcode: ^FO100,100^BY2,3,52^BCN,52,N,N,N^FD123456^FS
    const barcodeMatch = line.match(/^\^FO(\d+),(\d+)\^BY(\d+),\d+,(\d+)\^BCN,\d+,([YN]),N,N\^FD([^^]*)\^FS/);
    if (barcodeMatch) {
      layout.elements.push({
        type: 'barcode',
        id: `barcode_${layout.elements.length}`,
        x: parseInt(barcodeMatch[1]),
        y: parseInt(barcodeMatch[2]),
        moduleWidth: parseInt(barcodeMatch[3]),
        height: parseInt(barcodeMatch[4]),
        hr: barcodeMatch[5] === 'Y',
        data: unescapeZpl(barcodeMatch[6])
      });
      continue;
    }
    
    // Parse graphic box (line): ^FO100,100^GB200,10,2^FS
    const lineMatch = line.match(/^\^FO(\d+),(\d+)\^GB(\d+),(\d+),(\d+)\^FS/);
    if (lineMatch) {
      const x = parseInt(lineMatch[1]);
      const y = parseInt(lineMatch[2]);
      const w = parseInt(lineMatch[3]);
      const h = parseInt(lineMatch[4]);
      layout.elements.push({
        type: 'line',
        id: `line_${layout.elements.length}`,
        x,
        y,
        x2: x + w,
        y2: y + h,
        thickness: parseInt(lineMatch[5])
      });
      continue;
    }
  }
  
  return layout;
}
