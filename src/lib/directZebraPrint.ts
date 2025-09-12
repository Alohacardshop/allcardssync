/**
 * Direct Zebra Printer Communication
 * Simple, reliable ZPL printing to Zebra printers over TCP/IP
 */

export interface PrinterConnection {
  ip: string;
  port: number;
  name?: string;
}

export interface PrintResult {
  success: boolean;
  error?: string;
  details?: string;
}

/**
 * Send ZPL directly to Zebra printer using HTTP bridge
 */
export async function printZPLDirect(
  zpl: string, 
  printer: PrinterConnection,
  copies: number = 1
): Promise<PrintResult> {
  try {
    // If multiple copies, duplicate the ZPL content
    const finalZPL = copies > 1 ? zpl.repeat(copies) : zpl;
    
    // Use the existing zebra-tcp edge function for reliable TCP communication
    const response = await fetch('https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/zebra-tcp', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtcG9hbmRveWRhcXhoemRqbm1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDU5NDMsImV4cCI6MjA2OTk4MTk0M30.WoHlHO_Z4_ogeO5nt4I29j11aq09RMBtNug8a5rStgk'
      },
      body: JSON.stringify({
        host: printer.ip,
        port: printer.port,
        data: finalZPL,
        expectReply: false,
        timeoutMs: 10000
      })
    });

    const result = await response.json();
    
    if (!response.ok || !result.ok) {
      return {
        success: false,
        error: result.error || `HTTP ${response.status}`,
        details: `Failed to send to ${printer.ip}:${printer.port}`
      };
    }

    return {
      success: true,
      details: `Sent ${copies} label(s) to ${printer.ip}:${printer.port}`
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: `Connection failed to ${printer.ip}:${printer.port}`
    };
  }
}

/**
 * Test printer connection
 */
export async function testPrinterConnection(printer: PrinterConnection): Promise<PrintResult> {
  try {
    const response = await fetch('https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/zebra-tcp', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtcG9hbmRveWRhcXhoemRqbm1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDU5NDMsImV4cCI6MjA2OTk4MTk0M30.WoHlHO_Z4_ogeO5nt4I29j11aq09RMBtNug8a5rStgk'
      },
      body: JSON.stringify({
        host: printer.ip,
        port: printer.port,
        data: '~HS\r\n', // Zebra status command
        expectReply: true,
        timeoutMs: 5000
      })
    });

    const result = await response.json();
    
    if (!response.ok || !result.ok) {
      return {
        success: false,
        error: result.error || 'Connection failed',
        details: `Cannot reach ${printer.ip}:${printer.port}`
      };
    }

    return {
      success: true,
      details: `Printer at ${printer.ip}:${printer.port} is responding`
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
      details: `Failed to connect to ${printer.ip}:${printer.port}`
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