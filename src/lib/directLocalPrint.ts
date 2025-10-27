/**
 * Direct Local Network Printing
 * Simple HTTP-based printing directly to Zebra printers
 */

import { logger } from '@/lib/logger';

export interface PrinterConnection {
  ip: string;
  port?: number;
  name?: string;
  printNodeId?: number;
  usePrintNode?: boolean;
}

export interface PrintResult {
  success: boolean;
  error?: string;
  details?: string;
}

/**
 * Send ZPL directly to Zebra printer via HTTP
 */
export async function printZPLDirect(
  zpl: string, 
  printer: PrinterConnection,
  copies: number = 1
): Promise<PrintResult> {
  try {
    // Zebra printers typically accept ZPL on port 9100 or HTTP endpoint
    const printUrl = `http://${printer.ip}/printer/print`;
    
    // Prepare ZPL with copies
    const finalZPL = copies > 1 ? zpl.repeat(copies) : zpl;
    logger.debug('Attempting direct HTTP print', { printUrl, copies }, 'print');
    
    const response = await fetch(printUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: finalZPL,
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (response.ok) {
      return {
        success: true,
        details: `Sent ${copies} label(s) to ${printer.ip}`
      };
    } else {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        details: `Failed to send to ${printer.ip}`
      };
    }

  } catch (error) {
    logger.error('Direct print error', error as Error, { printerIp: printer.ip }, 'print');
    if (error instanceof Error && error.message.includes('Failed to fetch')) {
      return {
        success: false,
        error: 'CORS/Network blocked',
        details: `Browser security blocks direct access to ${printer.ip}. Try: 1) Use printer's web interface at http://${printer.ip} 2) Install Zebra Browser Print 3) Use local print bridge`
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
      details: `Connection failed to ${printer.ip}`
    };
  }
}

/**
 * Test printer connection via HTTP ping
 */
export async function testPrinterConnection(printer: PrinterConnection): Promise<PrintResult> {
  try {
    const testUrl = `http://${printer.ip}/printer/status`;
    
    const response = await fetch(testUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      return {
        success: true,
        details: `Printer at ${printer.ip} is responding`
      };
    } else {
      return {
        success: false,
        error: `HTTP ${response.status}`,
        details: `Printer at ${printer.ip} responded with error`
      };
    }

  } catch (error) {
    if (error instanceof Error && error.message.includes('Failed to fetch')) {
      return {
        success: false,
        error: 'CORS/Network blocked - this is normal',
        details: `Browser security prevents testing ${printer.ip}, but printing may still work. Try printing a test label.`
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
      details: `Cannot reach ${printer.ip}`
    };
  }
}

/**
 * Default printer settings for Zebra ZD410
 */
export const DEFAULT_ZD410_PRINTER: PrinterConnection = {
  ip: '192.168.1.70',
  port: 9100,
  name: 'Zebra ZD410'
};