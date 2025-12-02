// src/lib/templates/priceBarcodeThirds2x1.ts
// 2"×1" label (ZD410). Code-only template, no visual editor.
// Top third: 30% condition (left) + 70% price (right) with auto-fit
// Middle third: barcode (double condition height, centered) 
// Bottom third: title (1–2 lines) with safe margins

import { fitFontSingleLine, estimateCode128WidthDots } from '@/lib/zplFit';

export interface ThirdsLabelData {
  condition: string;    // e.g. "NM"
  priceDisplay: string; // e.g. "$24.99" or "$99,999.00"
  sku: string;          // Code 128 content, e.g. "PKM001"
  title: string;        // e.g. "Pikachu VMAX • Vivid Voltage • #047"
  dpi?: 203 | 300;      // default 203
  speedIps?: number;    // ^PR (default 4)
  darkness?: number;    // ^MD (default 10)
  copies?: number;      // ^PQ (default 1)
}

type Dpi = 203 | 300;

// Iteratively find a font size so wrapped text fits into <= maxLines lines in the box width
function fitFontWrapped(text: string, maxWidthDots: number, maxLines: number, startSize: number): number {
  let size = startSize;
  if (!text) return size;

  function linesNeeded(sz: number): number {
    const charsPerLine = Math.max(1, Math.floor(maxWidthDots / (sz * 0.62)));
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
  // --- Geometry & safety margins (203 dpi default) ---
  const PW = dpi === 300 ? 600 : 400;   // use more width
  const LL = dpi === 300 ? 300 : 203;   // 1" tall
  const LH_X = dpi === 300 ? 8 : 6;     // reduced left margin for more usable space
  const P = dpi === 300 ? 8 : 10;       // reduced padding for more space

  // Thirds
  const thirdH = Math.floor(LL / 3);
  const topY = 0, midY = thirdH, botY = thirdH * 2;
  const usableW = PW; // we use ^LH for left margin; FO x starts from 0

  // Split top third horizontally: 35%/65% for better balance
  const leftW  = Math.floor(usableW * 0.35);
  const rightW = usableW - leftW;

  // --- Condition (left 35%), make it bigger ---
  const condMaxH = dpi === 300 ? 100 : 80; // increased from 64 to 80 for 203dpi
  const condBoxW = leftW - P;
  const condH = Math.min(condMaxH, thirdH - P); // use less padding constraint
  const condSize = condH;

  // --- Price (right 70%), auto-fit to its box width ---
  const priceBoxW = rightW - P;             // width for ^FB
  const priceMaxH = condSize;               // allow price up to condition height
  const priceMinH = dpi === 300 ? 18 : 16;  // readability floor
  const priceSize = fitFontSingleLine(priceDisplay || '', priceBoxW, priceMaxH, priceMinH);

  // Y positions (vertically center within top third)
  const topInnerH = thirdH - 2 * P;
  const condY  = topY + P + Math.max(0, Math.floor((topInnerH - condSize) / 2));
  const priceY = topY + P + Math.max(0, Math.floor((topInnerH - priceSize) / 2));

  // --- Barcode in middle third: make it span wider ---
  const midInnerH = thirdH - P;
  const desiredBcH = condSize * 1.5; // slightly shorter to fit better
  const bcH = Math.min(desiredBcH, midInnerH);
  const moduleW = dpi === 300 ? 4 : 4; // increased module width for wider barcode
  const byLine = `^BY${moduleW},2.5,${bcH}`; // increased ratio for better spacing

  // Center barcode with minimal margin
  const estW = estimateCode128WidthDots((sku ?? '').length, moduleW);
  const margin = P / 2;
  const bcX = Math.max(0, Math.floor((usableW - estW) / 2));
  const bcY = midY + Math.max(0, Math.floor((thirdH - bcH) / 2));

  // --- Title in bottom third: up to 2 lines (fixed-ish size) ---
  const titleSize = dpi === 300 ? 28 : 17;
  const titleX = 0;
  const titleY = botY + P;
  const titleFBW = usableW - 2 * P;
  const titleFB = `^FB${titleFBW},2,${Math.floor(titleSize * 0.25)},L,0`;

  // --- Build ZPL ---
  return [
    '^XA',
    '^MTD',
    '^MNY',
    `^PW${PW}`,
    `^LL${LL}`,
    `^LH${LH_X},0`,
    '^FWN',
    '^PON',
    '^CI28',
    `^PR${speedIps}`,
    `^MD${darkness}`,
    '^SD15',

    // TOP third: condition (left), price (right, right-aligned, auto-fit)
    `^FO0,${condY}^A0N,${condSize},${condSize}^FD${(condition ?? '').trim()}^FS`,
    `^FO${leftW},${priceY}^A0N,${priceSize},${priceSize}^FB${priceBoxW},1,0,R,0^FD${(priceDisplay ?? '').trim()}^FS`,

    // MIDDLE third: barcode (double height of condition, centered, no HRI)
    `^FO${bcX},${bcY}`,
    byLine,
    `^BCN,${bcH},N,N,N^FD${(sku ?? '').trim()}^FS`,

    // BOTTOM third: title (≤2 lines)
    `^FO${titleX},${titleY}^A0N,${titleSize},${titleSize}${titleFB}^FD${(title || '').trim()}^FS`,

    '^XZ'
  ].join('\n');
}
