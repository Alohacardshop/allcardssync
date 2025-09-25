import type { ZPLElement, LabelLayout, PrinterPrefs, JobVars } from './types';

/**
 * Converts visual editor elements to ZPL string
 */
export function elementsToZpl(layout: LabelLayout, prefs?: PrinterPrefs): string {
  const lines: string[] = [];
  
  // ZPL header
  lines.push('^XA');
  
  // Printer settings
  if (prefs?.media === 'gap') lines.push('^MNY');
  else if (prefs?.media === 'blackmark') lines.push('^MNM');
  else if (prefs?.media === 'continuous') lines.push('^MNC');
  else lines.push('^MNY'); // default to gap
  
  lines.push('^MMC'); // cutter mode
  lines.push(`^PW${layout.width}`); // print width
  lines.push(`^LL${layout.height}`); // label length
  lines.push('^LH0,0'); // label home
  lines.push(`^LS${prefs?.leftShift ?? 0}`); // left shift
  lines.push('^FWN'); // field orientation
  lines.push('^PON'); // print orientation
  lines.push('^CI28'); // character set
  
  if (prefs?.speed) lines.push(`^PR${prefs.speed}`);
  if (prefs?.darkness) lines.push(`^MD${prefs.darkness}`);
  
  // Convert each element to ZPL
  for (const el of layout.elements) {
    if (el.type === 'text') {
      const font = el.font || '0';
      const h = el.h || 30;
      const w = el.w || 30;
      const text = el.text || '';
      lines.push(`^FO${el.x},${el.y}^A${font},${h},${w}^FD${escapeZplText(text)}^FS`);
    } else if (el.type === 'barcode') {
      const height = el.height || 52;
      const moduleWidth = el.moduleWidth || 2;
      const hr = el.hr ? 'Y' : 'N';
      const data = el.data || '';
      lines.push(`^FO${el.x},${el.y}^BY${moduleWidth},3,${height}^BCN,${height},${hr},N,N^FD${escapeZplText(data)}^FS`);
    } else if (el.type === 'line') {
      const thickness = el.thickness || 2;
      const x2 = el.x2 || el.x + 50;
      const y2 = el.y2 || el.y + 50;
      const width = Math.max(1, Math.abs(x2 - el.x));
      const height = Math.max(1, Math.abs(y2 - el.y));
      lines.push(`^FO${Math.min(el.x, x2)},${Math.min(el.y, y2)}^GB${width},${height},${thickness}^FS`);
    }
  }
  
  // ZPL footer - let PrintNode handle copies
  lines.push('^XZ');
  
  return lines.join('\n');
}

/**
 * Converts ZPL string to visual editor elements
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
        text: unescapeZplText(textMatch[6])
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
        data: unescapeZplText(barcodeMatch[6])
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

/**
 * Apply test variables to ZPL string
 */
export function applyVariablesToZpl(zpl: string, vars: JobVars): string {
  let result = zpl;
  
  if (vars.CARDNAME) {
    result = result.replace(/\{\{CARDNAME\}\}/g, escapeZplText(vars.CARDNAME));
  }
  if (vars.SETNAME) {
    result = result.replace(/\{\{SETNAME\}\}/g, escapeZplText(vars.SETNAME));
  }
  if (vars.CARDNUMBER) {
    result = result.replace(/\{\{CARDNUMBER\}\}/g, escapeZplText(vars.CARDNUMBER));
  }
  if (vars.CONDITION) {
    result = result.replace(/\{\{CONDITION\}\}/g, escapeZplText(vars.CONDITION));
  }
  if (vars.PRICE) {
    result = result.replace(/\{\{PRICE\}\}/g, escapeZplText(vars.PRICE));
  }
  if (vars.SKU) {
    result = result.replace(/\{\{SKU\}\}/g, escapeZplText(vars.SKU));
  }
  if (vars.BARCODE) {
    result = result.replace(/\{\{BARCODE\}\}/g, escapeZplText(vars.BARCODE));
  }
  
  return result;
}

function escapeZplText(text: string): string {
  return text
    .replace(/\^/g, '^5E') // Escape ^ character
    .replace(/~/g, '^7E')  // Escape ~ character
    .replace(/\n/g, '\\&') // Newline
    .replace(/\r/g, '');   // Remove carriage return
}

function unescapeZplText(text: string): string {
  return text
    .replace(/\^5E/g, '^')
    .replace(/\^7E/g, '~')
    .replace(/\\&/g, '\n');
}