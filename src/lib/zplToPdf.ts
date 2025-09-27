import jsPDF from 'jspdf';
import JsBarcode from 'jsbarcode';
import { LabelData } from './labelRenderer';

interface ZPLCommand {
  type: 'field' | 'barcode' | 'setup' | 'position';
  x?: number;
  y?: number;
  font?: string;
  height?: number;
  width?: number;
  data?: string;
  command?: string;
  params?: string[];
}

/**
 * Parse ZPL commands into structured data
 */
function parseZPL(zpl: string): ZPLCommand[] {
  const commands: ZPLCommand[] = [];
  const lines = zpl.split('\n').map(line => line.trim()).filter(line => line);
  
  let currentX = 0;
  let currentY = 0;
  
  for (const line of lines) {
    if (line.startsWith('^FO')) {
      // Field Origin - sets position
      const match = line.match(/\^FO(\d+),(\d+)/);
      if (match) {
        currentX = parseInt(match[1]);
        currentY = parseInt(match[2]);
      }
    } else if (line.includes('^A')) {
      // Font and Field Data combined (common pattern: ^FO16,12^A0,28,28^FD{{CARDNAME}}^FS)
      const fontMatch = line.match(/\^A([0-9A-Z]),(\d+),(\d+)/);
      const dataMatch = line.match(/\^FD([^}]+|\{\{[^}]+\}\})\^FS/);
      
      if (fontMatch && dataMatch) {
        commands.push({
          type: 'field',
          x: currentX,
          y: currentY,
          font: fontMatch[1],
          height: parseInt(fontMatch[2]),
          width: parseInt(fontMatch[3]),
          data: dataMatch[1]
        });
      }
    } else if (line.includes('^BC')) {
      // Barcode
      const barcodeMatch = line.match(/\^BCN,(\d+)/);
      const dataMatch = line.match(/\^FD([^}]+|\{\{[^}]+\}\})\^FS/);
      
      if (barcodeMatch && dataMatch) {
        commands.push({
          type: 'barcode',
          x: currentX,
          y: currentY,
          height: parseInt(barcodeMatch[1]),
          data: dataMatch[1]
        });
      }
    }
  }
  
  return commands;
}

/**
 * Substitute variables in ZPL template
 */
function substituteVariables(zpl: string, labelData: LabelData): string {
  const substitutions = {
    '{{CARDNAME}}': labelData.title,
    '{{CONDITION}}': labelData.condition, 
    '{{PRICE}}': labelData.price,
    '{{SKU}}': labelData.sku,
    '{{BARCODE}}': labelData.barcode,
    '{{LOT}}': labelData.lot
  };
  
  let result = zpl;
  for (const [placeholder, value] of Object.entries(substitutions)) {
    result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value || '');
  }
  
  return result;
}

/**
 * Render ZPL commands to canvas
 */
function renderZPLToCanvas(ctx: CanvasRenderingContext2D, commands: ZPLCommand[], labelData: LabelData): void {
  // Clear canvas with white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 406, 203);
  
  // Draw border
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, 406, 203);
  
  ctx.fillStyle = '#000000';
  
  for (const cmd of commands) {
    if (cmd.type === 'field' && cmd.x !== undefined && cmd.y !== undefined) {
      // Render text field
      const fontSize = Math.min(cmd.height || 20, 40);
      ctx.font = `${fontSize}px Arial`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      
      let text = cmd.data || '';
      // Handle variable substitution
      if (text.includes('{{')) {
        text = substituteVariables(text, labelData).replace(/\{\{.*?\}\}/g, '');
      }
      
      ctx.fillText(text, cmd.x, cmd.y);
      
    } else if (cmd.type === 'barcode' && cmd.x !== undefined && cmd.y !== undefined) {
      // Render barcode
      let barcodeData = cmd.data || '';
      if (barcodeData.includes('{{')) {
        barcodeData = substituteVariables(barcodeData, labelData).replace(/\{\{.*?\}\}/g, '');
      }
      
      try {
        const barcodeCanvas = document.createElement('canvas');
        JsBarcode(barcodeCanvas, barcodeData, {
          format: "CODE128",
          width: 2,
          height: cmd.height || 60,
          displayValue: false,
          margin: 0
        });
        
        ctx.drawImage(barcodeCanvas, cmd.x, cmd.y);
      } catch (error) {
        console.error('Barcode generation failed:', error);
        // Fallback to text
        ctx.font = '12px monospace';
        ctx.fillText(barcodeData, cmd.x, cmd.y);
      }
    }
  }
}

/**
 * Generate PDF from ZPL template and label data
 */
export async function generatePDFFromZPL(zpl: string, labelData: LabelData, dpi: number = 203): Promise<string> {
  // Create canvas for rendering
  const canvas = document.createElement('canvas');
  const scaleFactor = dpi / 96;
  canvas.width = 406 * scaleFactor;
  canvas.height = 203 * scaleFactor;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }
  
  // Scale context to match DPI
  ctx.scale(scaleFactor, scaleFactor);
  
  // Substitute variables in ZPL
  const processedZpl = substituteVariables(zpl, labelData);
  
  // Parse and render ZPL commands
  const commands = parseZPL(processedZpl);
  renderZPLToCanvas(ctx, commands, labelData);
  
  // Convert to PDF
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
          format: [2, 1]
        });
        
        // Add the image to fill the entire page
        pdf.addImage(dataUrl, 'PNG', 0, 0, 2, 1);
        
        // Return base64 PDF data
        const pdfBase64 = pdf.output('datauristring').split(',')[1];
        resolve(pdfBase64);
      };
      reader.onerror = () => reject(new Error('Failed to read PNG blob'));
      reader.readAsDataURL(blob);
    }, 'image/png');
  });
}