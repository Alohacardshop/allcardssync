import { LabelLayout, ZPLElement, JobVars, PrinterPrefs } from './types';
import { generateCutterCommands, type CutterSettings } from '@/hooks/useCutterSettings';

// Calculate optimal font size for text elements based on dimensions
function calculateOptimalFontSize(
  text: string, 
  width: number, 
  height: number, 
  minSize = 8, 
  maxSize = 72
): number {
  // Approximate character width based on common label fonts
  const avgCharWidth = 0.6; // Ratio of font height to average character width
  const lineHeight = 1.2; // Line height multiplier
  
  // Calculate maximum font size based on height constraint
  const maxFontByHeight = Math.floor(height / lineHeight);
  
  // Calculate maximum font size based on width constraint
  const estimatedTextWidth = text.length * avgCharWidth;
  const maxFontByWidth = estimatedTextWidth > 0 ? Math.floor(width / estimatedTextWidth) : maxSize;
  
  // Take the smaller of the two constraints and clamp to min/max
  const optimalSize = Math.min(maxFontByHeight, maxFontByWidth);
  return Math.max(minSize, Math.min(maxSize, optimalSize));
}

export function zplFromElements(layout: LabelLayout, prefs?: PrinterPrefs, cutterSettings?: CutterSettings): string {
  const lines: string[] = [];
  lines.push('^XA');
  lines.push('^MTD');                         // direct thermal
  lines.push(mediaCommand(prefs?.media ?? 'gap'));
  
  // Add cutter setup commands if enabled
  if (cutterSettings?.enableCutter) {
    const { setupCommands, cutCommand } = generateCutterCommands(cutterSettings);
    setupCommands.forEach(cmd => lines.push(cmd));
    if (cutCommand) lines.push(cutCommand);
  }
  
  lines.push('^PW' + layout.width);
  lines.push('^LL' + layout.height);
  lines.push('^LH0,0');
  lines.push('^LS' + (prefs?.leftShift ?? 0));
  lines.push('^FWN');
  lines.push('^PON');
  lines.push('^CI28');                        // UTF-8
  if (prefs?.speed !== undefined) lines.push('^PR' + prefs.speed);
  if (prefs?.darkness !== undefined) lines.push('^MD' + prefs.darkness);

  for (const el of layout.elements) {
    if (el.type === 'text') {
      const font = el.font ?? '0';
      let h = el.h ?? 30;
      let w = el.w ?? 30;
      
      // Auto-size font if element has dimensions but no explicit font size
      if (!el.font && el.w && el.h && el.text) {
        const optimalSize = calculateOptimalFontSize(el.text, el.w, el.h);
        h = optimalSize;
        w = Math.floor(optimalSize * 0.6); // Adjust width proportionally
      }
      
      lines.push(`^FO${el.x},${el.y}^A${font},${h},${w}^FD${esc(el.text)}^FS`);
    } else if (el.type === 'barcode') {
      const h = el.height ?? 52, m = el.moduleWidth ?? 2, hr = el.hr ? 'Y' : 'N';
      lines.push(`^FO${el.x},${el.y}^BY${m},3,${h}^BCN,${h},${hr},N,N^FD${esc(el.data)}^FS`);
    } else if (el.type === 'line') {
      const t = el.thickness ?? 2, wpx = Math.max(1, Math.abs(el.x2 - el.x)), hpx = Math.max(1, Math.abs(el.y2 - el.y));
      lines.push(`^FO${Math.min(el.x, el.x2)},${Math.min(el.y, el.y2)}^GB${wpx},${hpx},${t}^FS`);
    }
  }
  lines.push('^PQ' + (prefs?.copies ?? 1) + ',1,0,Y');
  lines.push('^XZ');
  return lines.join('\n');
}

export function zplFromTemplateString(zpl: string, v: JobVars): string {
  return zpl
    .replace(/\{\{CARDNAME\}\}/g, safe(v.CARDNAME))
    .replace(/\{\{CONDITION\}\}/g, safe(v.CONDITION))
    .replace(/\{\{PRICE\}\}/g, safe(v.PRICE))
    .replace(/\{\{SKU\}\}/g, safe(v.SKU))
    .replace(/\{\{BARCODE\}\}/g, safe(v.BARCODE));
}

function mediaCommand(m: PrinterPrefs['media']) {
  if (m === 'blackmark') return '^MNM';
  if (m === 'continuous') return '^MNN';
  return '^MNY'; // gap
}

const esc = (s?: string) => (s ?? '').replace(/\^/g, ' ').replace(/~/g, ' ');
const safe = (s?: string) => s ?? '';