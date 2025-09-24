// src/lib/templates/priceBarcodeThirds2x1.ts
// 2"×1" label (ZD410). Code-only template, no visual editor.
// Top third: 30% condition (left) + 70% price (right) with shrink-to-fit
// Middle third: barcode (no HRI) – height equals condition text height
// Bottom third: title (1–2 lines) with shrink-to-fit

export interface ThirdsLabelData {
  condition: string;    // e.g. "NM"
  priceDisplay: string; // e.g. "$24.99"
  sku: string;          // Code 128 content, e.g. "PKM001"
  title: string;        // e.g. "Pikachu VMAX • Vivid Voltage • #047"
  dpi?: 203 | 300;      // default 203
  speedIps?: number;    // ^PR (default 4)
  darkness?: number;    // ^MD (default 10)
  copies?: number;      // ^PQ (default 1)
}

// very rough width-per-character factor for ZPL ^A0N (scalable font).
// works well enough for shrink-to-fit on thermal labels.
const CHAR_W_RATIO = 0.58;

// Iteratively find a font size that fits text within a box (single-line)
function fitFontSingleLine(text: string, maxWidthDots: number, startSize: number): number {
  let size = startSize;
  if (!text) return size;
  while (size > 8) {
    const estWidth = text.length * (size * CHAR_W_RATIO);
    if (estWidth <= maxWidthDots) break;
    size -= 1;
  }
  return size;
}

// Iteratively find a font size so wrapped text fits into <= maxLines lines in the box width
function fitFontWrapped(text: string, maxWidthDots: number, maxLines: number, startSize: number): number {
  let size = startSize;
  if (!text) return size;

  function linesNeeded(sz: number): number {
    const charsPerLine = Math.max(1, Math.floor(maxWidthDots / (sz * CHAR_W_RATIO)));
    const words = text.split(/\s+/);
    let lines = 1;
    let current = 0;
    for (const w of words) {
      const wlen = w.length + (current === 0 ? 0 : 1); // include space
      if (current + wlen > charsPerLine) {
        lines += 1;
        current = w.length;
      } else {
        current += wlen;
      }
    }
    return lines;
  }

  while (size > 8 && linesNeeded(size) > maxLines) size -= 1;
  return size;
}

export function zplPriceBarcodeThirds2x1({
  condition,
  priceDisplay,
  sku,
  title,
  dpi = 203,
  speedIps = 4,
  darkness = 10,
  copies = 1
}: ThirdsLabelData): string {
  // Label dimensions in dots
  const PW = dpi === 300 ? 600 : 448;   // 2.0" width
  const LL = dpi === 300 ? 300 : 203;   // 1.0" height

  // Thirds
  const topH    = Math.round(LL / 3);
  const midH    = Math.round(LL / 3);
  const bottomH = LL - topH - midH;

  // Paddings
  const P = Math.round((dpi === 300 ? 6 : 4)); // small inset padding

  // Top third split: 30% / 70%
  const topY = P;
  const topInnerH = topH - 2 * P;

  const leftW  = Math.round(PW * 0.30) - 2 * P;
  const rightW = Math.round(PW * 0.70) - 2 * P;
  const leftX  = P;
  const rightX = Math.round(PW * 0.30) + P;

  // == Key rule ==
  // Condition text height must match barcode height.
  // We'll choose a target based on top block height, then enforce barcode = that height.
  const targetH = Math.max(18, Math.min( topInnerH, dpi === 300 ? 64 : 42 )); // reasonable cap

  // Fit condition text (single line) within left box
  let condSize = fitFontSingleLine(condition || '', leftW, targetH);
  // Keep it from exceeding the target (so it matches barcode height visually)
  condSize = Math.min(condSize, targetH);

  // Price fits in right box (single line), shrink as needed
  let priceSize = fitFontSingleLine(priceDisplay || '', rightW, targetH);
  priceSize = Math.min(priceSize, targetH);

  // Middle (barcode) — height equals condSize
  const midY = topH + Math.round((midH - condSize) / 2); // center barcode vertically in middle third

  // Bottom (title) — up to 2 lines, shrink as needed
  const bottomY = topH + midH + P;
  const bottomW = PW - 2 * P;
  const titleStartSize = Math.min(dpi === 300 ? 30 : 20, bottomH - 2 * P);
  const titleSize = fitFontWrapped(title || '', bottomW, 2, titleStartSize);

  // Compute vertical centering for top texts
  const condY  = topY + Math.max(0, Math.round((topInnerH - condSize) / 2));
  const priceY = topY + Math.max(0, Math.round((topInnerH - priceSize) / 2));

  // ZPL
  // Note: we keep barcode narrow to save horizontal space: ^BY2 at 203, ^BY3 at 300
  const BY = dpi === 300 ? '^BY3,2,40' : '^BY2,2,40';

  return [
    '^XA',
    '^MTD',
    '^MNY',
    `^PW${PW}`,
    `^LL${LL}`,
    '^LH0,0',
    '^FWN',
    '^PON',
    '^CI28',
    `^PR${speedIps}`,
    `^MD${darkness}`,

    // Condition (top-left, single line)
    `^FO${leftX},${condY}^A0N,${condSize},${condSize}^FD${condition || ''}^FS`,

    // Price (top-right, single line)
    `^FO${rightX},${priceY}^A0N,${priceSize},${priceSize}^FD${priceDisplay || ''}^FS`,

    // Barcode (middle third), height = condSize, no human-readable
    `^FO${P},${midY}`,
    BY,
    `^BCN,${condSize},N,N,N^FD${sku || ''}^FS`,

    // Title (bottom third), up to 2 lines, shrink-to-fit
    // We use ^FB to wrap to 2 lines; we already shrank font to fit within 2 lines width.
    `^FO${P},${bottomY}^A0N,${titleSize},${titleSize}^FB${bottomW},2,${Math.round(titleSize*0.25)},L,0^FD${(title || '').trim()}^FS`,

    `^PQ${copies},1,0,Y`,
    '^XZ'
  ].join('\n');
}
