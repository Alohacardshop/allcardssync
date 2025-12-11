/**
 * QZ Tray Utility Library
 * Provides functions to connect to QZ Tray, list printers, and send raw ZPL
 */

// Import qz-tray - CommonJS module
import qz from 'qz-tray';

// Connection state
let isConnecting = false;

/**
 * Check if QZ Tray is connected
 */
export function isConnected(): boolean {
  try {
    return qz.websocket.isActive();
  } catch {
    return false;
  }
}

/**
 * Connect to QZ Tray WebSocket
 * @throws Error if connection fails or QZ Tray is not installed
 */
export async function connectQzTray(): Promise<void> {
  if (isConnected()) {
    console.log('[QZ Tray] Already connected');
    return;
  }

  if (isConnecting) {
    console.log('[QZ Tray] Connection already in progress');
    return;
  }

  try {
    isConnecting = true;
    console.log('[QZ Tray] Connecting...');

    await qz.websocket.connect();
    console.log('[QZ Tray] Connected successfully');
  } catch (error) {
    console.error('[QZ Tray] Connection failed:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Unable to connect') || error.message.includes('CLOSED')) {
        throw new Error(
          'Cannot connect to QZ Tray. Please ensure QZ Tray is installed and running. ' +
          'Download from: https://qz.io/download/'
        );
      }
      throw error;
    }
    
    throw new Error('Failed to connect to QZ Tray');
  } finally {
    isConnecting = false;
  }
}

/**
 * Disconnect from QZ Tray
 */
export async function disconnectQzTray(): Promise<void> {
  if (!isConnected()) {
    console.log('[QZ Tray] Not connected');
    return;
  }

  try {
    await qz.websocket.disconnect();
    console.log('[QZ Tray] Disconnected');
  } catch (error) {
    console.error('[QZ Tray] Disconnect error:', error);
    throw error;
  }
}

/**
 * List all available printers
 * @returns Array of printer names
 */
export async function listPrinters(): Promise<string[]> {
  if (!isConnected()) {
    throw new Error('Not connected to QZ Tray. Please connect first.');
  }

  try {
    const printers = await qz.printers.find();
    console.log('[QZ Tray] Found printers:', printers);
    return Array.isArray(printers) ? printers : [printers];
  } catch (error) {
    console.error('[QZ Tray] Error listing printers:', error);
    throw new Error('Failed to list printers');
  }
}

/**
 * Find Zebra printers specifically
 * @returns Array of Zebra printer names
 */
export async function findZebraPrinters(): Promise<string[]> {
  const allPrinters = await listPrinters();
  return allPrinters.filter(
    (name) => name.toLowerCase().includes('zebra') || name.toLowerCase().includes('zd')
  );
}

/**
 * Get the default printer
 * @returns Default printer name
 */
export async function getDefaultPrinter(): Promise<string> {
  if (!isConnected()) {
    throw new Error('Not connected to QZ Tray. Please connect first.');
  }

  try {
    return await qz.printers.getDefault();
  } catch (error) {
    console.error('[QZ Tray] Error getting default printer:', error);
    throw new Error('Failed to get default printer');
  }
}

/**
 * Send raw ZPL to a printer
 * @param printerName - Name of the printer to use
 * @param zpl - Raw ZPL string to send
 */
export async function printZpl(printerName: string, zpl: string): Promise<void> {
  if (!isConnected()) {
    throw new Error('Not connected to QZ Tray. Please connect first.');
  }

  if (!printerName) {
    throw new Error('Printer name is required');
  }

  if (!zpl || zpl.trim().length === 0) {
    throw new Error('ZPL data is required');
  }

  try {
    console.log(`[QZ Tray] Printing to ${printerName}...`);
    
    const config = qz.configs.create(printerName);
    
    // Send raw ZPL data
    await qz.print(config, [{
      type: 'raw',
      format: 'plain',
      flavor: 'plain',
      data: zpl,
    }]);
    
    console.log(`[QZ Tray] Print job sent to ${printerName}`);
  } catch (error) {
    console.error('[QZ Tray] Print error:', error);
    
    if (error instanceof Error) {
      throw new Error(`Print failed: ${error.message}`);
    }
    
    throw new Error('Print failed');
  }
}

/**
 * Test connection to QZ Tray without throwing
 * @returns True if connected, false otherwise
 */
export async function testConnection(): Promise<boolean> {
  try {
    if (isConnected()) return true;
    await connectQzTray();
    return isConnected();
  } catch {
    return false;
  }
}
