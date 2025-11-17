import JsBarcode from 'jsbarcode';

export interface ZPLRenderOptions {
  width?: number;
  height?: number;
  dpi?: number;
  scale?: number;
  showBorder?: boolean;
}

interface ZPLCommand {
  type: 'field' | 'barcode' | 'setup' | 'position';
  x?: number;
  y?: number;
  font?: string;
  height?: number;
  width?: number;
  data?: string;
}

/**
 * Parse ZPL commands into structured data
 */
export function parseZPL(zpl: string): ZPLCommand[] {
  const commands: ZPLCommand[] = [];
  const lines = zpl.split('\n').map(line => line.trim()).filter(line => line);
  
  let currentX = 0;
  let currentY = 0;
  
  for (const line of lines) {
    if (line.startsWith('^FO')) {
      const match = line.match(/\^FO(\d+),(\d+)/);
      if (match) {
        currentX = parseInt(match[1]);
        currentY = parseInt(match[2]);
      }
    } else if (line.includes('^A')) {
      const fontMatch = line.match(/\^A([0-9A-Z]),(\d+),(\d+)/);
      const dataMatch = line.match(/\^FD([^\^]+)\^FS/);
      
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
      const barcodeMatch = line.match(/\^BCN,(\d+)/);
      const dataMatch = line.match(/\^FD([^\^]+)\^FS/);
      
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
export function substituteVariables(zpl: string, vars: Record<string, string>): string {
  let result = zpl;
  for (const [key, value] of Object.entries(vars)) {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value || '');
  }
  return result;
}

/**
 * Render ZPL to canvas with real-time preview
 */
export async function renderZPLToCanvas(
  canvas: HTMLCanvasElement,
  zpl: string,
  variables: Record<string, string>,
  options: ZPLRenderOptions = {}
): Promise<void> {
  const {
    width = 406,
    height = 203,
    scale = 1,
    showBorder = true
  } = options;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Set canvas dimensions
  canvas.width = width * scale;
  canvas.height = height * scale;
  
  // Scale context
  ctx.scale(scale, scale);
  
  // Clear with white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  
  // Draw border
  if (showBorder) {
    ctx.strokeStyle = 'hsl(var(--border))';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);
  }
  
  // Substitute variables
  const processedZpl = substituteVariables(zpl, variables);
  
  // Parse and render
  const commands = parseZPL(processedZpl);
  ctx.fillStyle = '#000000';
  
  for (const cmd of commands) {
    if (cmd.type === 'field' && cmd.x !== undefined && cmd.y !== undefined) {
      const fontSize = Math.min(cmd.height || 20, 40);
      ctx.font = `${fontSize}px Arial`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      
      const text = cmd.data || '';
      ctx.fillText(text, cmd.x, cmd.y);
      
    } else if (cmd.type === 'barcode' && cmd.x !== undefined && cmd.y !== undefined) {
      const barcodeData = cmd.data || '';
      
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
        ctx.font = '12px monospace';
        ctx.fillText(barcodeData, cmd.x, cmd.y);
      }
    }
  }
}

/**
 * Validate ZPL and return error if invalid
 */
export function validateZPL(zpl: string): { valid: boolean; error?: string } {
  try {
    if (!zpl || !zpl.trim()) {
      return { valid: false, error: 'ZPL code is empty' };
    }
    
    if (!zpl.includes('^XA')) {
      return { valid: false, error: 'Missing ^XA (start of label)' };
    }
    
    if (!zpl.includes('^XZ')) {
      return { valid: false, error: 'Missing ^XZ (end of label)' };
    }
    
    const commands = parseZPL(zpl);
    if (commands.length === 0) {
      return { valid: false, error: 'No valid ZPL commands found' };
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Parse error: ${error}` };
  }
}
