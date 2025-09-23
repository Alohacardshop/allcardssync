import { LabelLayout, ZPLElement, JobVars, PrinterPrefs } from './types';

export function zplFromElements(layout: LabelLayout, prefs?: PrinterPrefs): string {
  const lines: string[] = [];
  lines.push('^XA');
  lines.push('^MTD');                         // direct thermal
  lines.push(mediaCommand(prefs?.media ?? 'gap'));
  lines.push('^MMC');                         // cutter on when available
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
      const font = el.font ?? '0', h = el.h ?? 30, w = el.w ?? 30;
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