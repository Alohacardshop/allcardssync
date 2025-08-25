import jsPDF from 'jspdf';
import JsBarcode from 'jsbarcode';

export interface LabelData {
  title: string;
  sku: string;
  price: string;
  lot: string;
  condition: string;
  barcode: string;
}

export interface LabelFieldConfig {
  includeTitle: boolean;
  includeSku: boolean;
  includePrice: boolean;
  includeLot: boolean;
  includeCondition: boolean;
  barcodeMode: 'qr' | 'barcode' | 'none';
  templateStyle?: string;
}

// Constants for 2x1 inch label at 203 DPI
export const LABEL_WIDTH = 406; // 2 inches * 203 DPI
export const LABEL_HEIGHT = 203; // 1 inch * 203 DPI

const calculateFontSize = (text: string, maxWidth: number, maxHeight: number, ctx: CanvasRenderingContext2D): number => {
  let fontSize = Math.min(maxHeight * 0.8, 40);
  
  while (fontSize > 8) {
    ctx.font = `${fontSize}px Arial`;
    const metrics = ctx.measureText(text);
    if (metrics.width <= maxWidth) {
      break;
    }
    fontSize -= 2;
  }
  
  return Math.max(fontSize, 8);
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines.slice(0, 2); // Limit to 2 lines
};

const drawBarcode = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, data: string, mode: 'qr' | 'barcode') => {
  if (mode === 'barcode') {
    // Create a temporary canvas for JsBarcode
    const barcodeCanvas = document.createElement('canvas');
    try {
      JsBarcode(barcodeCanvas, data, {
        format: "CODE128",
        width: 2,
        height: height,
        displayValue: false,
        margin: 0
      });
      
      // Draw the barcode on the main canvas
      ctx.drawImage(barcodeCanvas, x, y, width, height);
    } catch (error) {
      console.error('Barcode generation failed:', error);
      // Fallback to text if barcode fails
      ctx.fillStyle = '#000000';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(data, x + width/2, y + height/2);
    }
  } else if (mode === 'qr') {
    // Simple QR placeholder pattern
    ctx.fillStyle = '#000000';
    const cellSize = Math.min(width, height) / 21; // 21x21 grid for QR
    for (let i = 0; i < 21; i++) {
      for (let j = 0; j < 21; j++) {
        // Create a pseudo-random pattern based on data
        if ((i + j + data.length) % 3 === 0) {
          ctx.fillRect(x + j * cellSize, y + i * cellSize, cellSize, cellSize);
        }
      }
    }
  }
};

const drawText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, maxHeight: number, align: 'left' | 'center' | 'right' = 'left') => {
  if (!text.trim()) return;
  
  const fontSize = calculateFontSize(text, maxWidth, maxHeight, ctx);
  ctx.font = `${fontSize}px Arial`;
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'middle';
  
  let drawX = x;
  if (align === 'center') {
    drawX = x + maxWidth / 2;
    ctx.textAlign = 'center';
  } else if (align === 'right') {
    drawX = x + maxWidth;
    ctx.textAlign = 'right';
  } else {
    ctx.textAlign = 'left';
  }
  
  ctx.fillText(text, drawX, y + maxHeight / 2);
};

export const renderLabelToCanvas = (
  ctx: CanvasRenderingContext2D,
  fieldConfig: LabelFieldConfig,
  labelData: LabelData,
  showGuides: boolean = false
): void => {
  // Clear canvas
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);

  // Draw border
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, LABEL_WIDTH - 2, LABEL_HEIGHT - 2);

  // Use boxed layout
  const padding = 10;
  const topRowHeight = 60;
  const middleHeight = 60;
  const bottomHeight = LABEL_HEIGHT - topRowHeight - middleHeight - padding * 3;

  // Top row boxes
  const topLeftWidth = 120;
  const topRightWidth = LABEL_WIDTH - topLeftWidth - padding * 3;

  // Draw guide outlines only if showGuides is enabled
  if (showGuides) {
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    
    // Top left box (Condition)
    ctx.strokeRect(padding, padding, topLeftWidth, topRowHeight);
    
    // Top right box (Price)
    const topRightX = padding + topLeftWidth + padding;
    ctx.strokeRect(topRightX, padding, topRightWidth, topRowHeight);
    
    // Bottom box (Title)
    const bottomY = padding + topRowHeight + padding + middleHeight + padding;
    ctx.strokeRect(padding, bottomY, LABEL_WIDTH - padding * 2, bottomHeight);
    
    ctx.setLineDash([]); // Reset to solid line
  }

  // Top left content (Condition) - dynamic sizing to fill box
  if (fieldConfig.includeCondition && labelData.condition) {
    const fontSize = calculateFontSize(labelData.condition, topLeftWidth - 10, topRowHeight - 10, ctx);
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelData.condition, padding + topLeftWidth/2, padding + topRowHeight/2);
  }

  // Top right content (Price) - dynamic sizing to fill box
  if (fieldConfig.includePrice && labelData.price) {
    const topRightX = padding + topLeftWidth + padding;
    const fontSize = calculateFontSize(labelData.price, topRightWidth - 10, topRowHeight - 10, ctx);
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelData.price, topRightX + topRightWidth/2, padding + topRowHeight/2);
  }

  // Barcode section - positioned right below the price box
  if (fieldConfig.barcodeMode !== 'none') {
    const barcodeY = padding + topRowHeight + 5; // Right below price box with small gap
    const barcodeWidth = LABEL_WIDTH - padding * 4; // Full width with padding
    const barcodeHeight = 50; // Fixed height for barcode
    const barcodeX = padding * 2; // Centered
    drawBarcode(ctx, barcodeX, barcodeY, barcodeWidth, barcodeHeight, labelData.barcode, fieldConfig.barcodeMode);
    
    // Add SKU below barcode if included - make it smaller and closer
    if (fieldConfig.includeSku && labelData.sku) {
      ctx.font = '8px Arial';
      ctx.fillStyle = '#666666';
      ctx.textAlign = 'center';
      ctx.fillText(`SKU: ${labelData.sku}`, LABEL_WIDTH / 2, barcodeY + barcodeHeight + 8);
    }
  }

  // Title section - use entire bottom area for maximum font size
  if (fieldConfig.includeTitle && labelData.title) {
    // Calculate start position right after barcode/SKU area
    const barcodeEndY = fieldConfig.barcodeMode !== 'none' ? 
      (padding + topRowHeight + 5 + 50 + 15) : // After barcode + small SKU gap
      (padding + topRowHeight + 5); // Or just after top row if no barcode
    
    const titleStartY = barcodeEndY; // Start immediately after barcode area
    const titleHeight = LABEL_HEIGHT - titleStartY - padding; // Use all remaining space to bottom
    const titleWidth = LABEL_WIDTH - padding * 2;
    
    // Start with maximum possible font size for the available space
    let fontSize = Math.floor(titleHeight / 1.8); // More aggressive sizing for bigger text
    fontSize = Math.min(fontSize, 60); // Higher cap for larger text
    
    let lines: string[] = [];
    let finalFontSize = fontSize;
    
    // Find the largest font size that fits the content
    while (finalFontSize > 10) {
      ctx.font = `${finalFontSize}px Arial`;
      lines = wrapText(ctx, labelData.title, titleWidth - 10);
      
      // Check if it fits within height constraints
      const lineHeight = finalFontSize * 1.1; // Tighter line spacing for more space
      const totalTextHeight = lines.length * lineHeight;
      
      if (totalTextHeight <= titleHeight - 5 && lines.length <= 2) {
        break; // Found optimal size
      }
      
      finalFontSize -= 1;
    }
    
    // Draw the lines centered vertically in the available space
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const lineHeight = finalFontSize * 1.1;
    const totalTextHeight = lines.length * lineHeight;
    const startY = titleStartY + (titleHeight - totalTextHeight) / 2;
    
    lines.forEach((line, index) => {
      ctx.fillText(line, LABEL_WIDTH / 2, startY + (index * lineHeight) + lineHeight / 2);
    });
  }

  // Add lot number support if included
  if (fieldConfig.includeLot && labelData.lot) {
    ctx.font = '10px Arial';
    ctx.fillStyle = '#666666';
    ctx.textAlign = 'right';
    ctx.fillText(`Lot: ${labelData.lot}`, LABEL_WIDTH - padding - 5, padding + 15);
  }
};

export const generateLabelPDF = async (
  fieldConfig: LabelFieldConfig,
  labelData: LabelData,
  dpi: number = 203
): Promise<string> => {
  // Create a canvas for rendering
  const canvas = document.createElement('canvas');
  const scaleFactor = dpi / 96; // 96 is standard screen DPI
  canvas.width = LABEL_WIDTH * scaleFactor;
  canvas.height = LABEL_HEIGHT * scaleFactor;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Scale the context to match DPI
  ctx.scale(scaleFactor, scaleFactor);
  
  // Render the label
  renderLabelToCanvas(ctx, fieldConfig, labelData, false);
  
  // Convert to blob and then to PDF
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to create PNG blob'));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        
        // Create PDF with exact 2x1 inch dimensions
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'in',
          format: [2, 1] // 2x1 inch
        });
        
        // Add the PNG image to fill the entire page
        pdf.addImage(dataUrl, 'PNG', 0, 0, 2, 1);
        
        // Return base64 PDF data
        const pdfBase64 = pdf.output('datauristring').split(',')[1];
        resolve(pdfBase64);
      };
      reader.onerror = () => reject(new Error('Failed to read PNG blob'));
      reader.readAsDataURL(blob);
    }, 'image/png');
  });
};

export const generateLabelPNG = async (
  fieldConfig: LabelFieldConfig,
  labelData: LabelData,
  dpi: number = 203
): Promise<Blob> => {
  // Create a canvas for rendering
  const canvas = document.createElement('canvas');
  const scaleFactor = dpi / 96; // 96 is standard screen DPI
  canvas.width = LABEL_WIDTH * scaleFactor;
  canvas.height = LABEL_HEIGHT * scaleFactor;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Scale the context to match DPI
  ctx.scale(scaleFactor, scaleFactor);
  
  // Render the label
  renderLabelToCanvas(ctx, fieldConfig, labelData, false);
  
  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create PNG blob'));
      }
    }, 'image/png');
  });
};