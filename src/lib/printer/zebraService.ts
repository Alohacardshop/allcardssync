/**
 * Zebra Printer Service - QZ Tray Integration
 * Uses QZ Tray for all printer operations
 */

import {
  connectQzTray,
  isConnected as qzIsConnected,
  listPrinters as qzListPrinters,
  printZpl as qzPrintZpl,
  testConnection as qzTestConnection,
} from '@/lib/qzTray';

const STORAGE_KEY = 'zebra-printer-config';

// Types
export interface PrinterConfig {
  name: string;  // Printer name from QZ Tray
}

export interface PrintResult {
  success: boolean;
  error?: string;
  message?: string;
}

export interface PrinterStatus {
  ready: boolean;
  paused: boolean;
  headOpen: boolean;
  mediaOut: boolean;
  raw: string;
}

export interface BridgeStatus {
  connected: boolean;
  version?: string;
  error?: string;
}

export interface SystemPrinter {
  name: string;
  status: string;
  model?: string;
  driverName?: string;
}

// Configuration management
export function getConfig(): PrinterConfig | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

export function saveConfig(config: PrinterConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// Check if QZ Tray is connected
export async function checkBridgeStatus(): Promise<BridgeStatus> {
  console.log('[QZ Tray] Checking status...');
  
  try {
    const connected = qzIsConnected();
    
    if (connected) {
      console.log('[QZ Tray] Already connected');
      return { connected: true, version: '2.x' };
    }

    // Try to connect
    const canConnect = await qzTestConnection();
    
    if (canConnect) {
      console.log('[QZ Tray] Connected successfully');
      return { connected: true, version: '2.x' };
    }
    
    return { connected: false, error: 'QZ Tray not running. Install from https://qz.io/download/' };
  } catch (error) {
    console.error('[QZ Tray] Status check error:', error);
    return { 
      connected: false, 
      error: error instanceof Error ? error.message : 'QZ Tray not reachable' 
    };
  }
}

// Get available printers via QZ Tray
export async function getSystemPrinters(): Promise<SystemPrinter[]> {
  try {
    // Ensure connected
    if (!qzIsConnected()) {
      await connectQzTray();
    }

    const printers = await qzListPrinters();
    
    return printers.map((name) => ({
      name,
      status: 'available',
    }));
  } catch (error) {
    console.error('[QZ Tray] Error listing printers:', error);
    return [];
  }
}

// Core printing function via QZ Tray
export async function print(zpl: string, printerName?: string): Promise<PrintResult> {
  const config = getConfig();
  const targetPrinter = printerName || config?.name;
  
  if (!targetPrinter) {
    return { 
      success: false, 
      error: 'No printer configured. Please select a printer in Settings.' 
    };
  }

  try {
    // Ensure connected
    if (!qzIsConnected()) {
      await connectQzTray();
    }

    await qzPrintZpl(targetPrinter, zpl);
    
    return { success: true, message: `Sent to ${targetPrinter}` };
  } catch (error) {
    console.error('[QZ Tray] Print error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Unable to connect') || error.message.includes('not loaded')) {
        return { 
          success: false, 
          error: 'QZ Tray not running. Please install from https://qz.io/download/' 
        };
      }
      return { success: false, error: error.message };
    }
    
    return { success: false, error: 'Print failed' };
  }
}

// Print to specific printer (alias for consistency)
export async function printToSystemPrinter(zpl: string, printerName: string, copies: number = 1): Promise<PrintResult> {
  // For multiple copies, add ZPL quantity command
  let printData = zpl;
  if (copies > 1) {
    // Insert ^PQ command before ^XZ
    printData = zpl.replace(/\^XZ/gi, `^PQ${copies}^XZ`);
  }
  
  return print(printData, printerName);
}

// Test if we can connect to QZ Tray
export async function testConnection(): Promise<boolean> {
  console.log('[QZ Tray] Testing connection...');
  try {
    return await qzTestConnection();
  } catch (error) {
    console.error('[QZ Tray] Test connection error:', error);
    return false;
  }
}

// Ping test - just checks QZ Tray connection
export async function pingPrinter(): Promise<{ success: boolean; latency?: number; error?: string }> {
  const start = Date.now();
  try {
    const connected = await qzTestConnection();
    const latency = Date.now() - start;
    
    return {
      success: connected,
      latency,
      error: connected ? undefined : 'QZ Tray not connected',
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Connection failed' 
    };
  }
}

// Query printer status (simplified for QZ Tray)
export async function queryStatus(): Promise<PrinterStatus> {
  const connected = qzIsConnected();
  
  return {
    ready: connected,
    paused: false,
    headOpen: false,
    mediaOut: false,
    raw: connected ? 'QZ Tray Connected' : 'QZ Tray Not Connected',
  };
}

// Database sync functions (unchanged - still useful for storing preferences)
import { supabase } from "@/integrations/supabase/client";

export async function syncConfigToDatabase(
  config: PrinterConfig, 
  userId: string, 
  locationGid: string,
  storeKey?: string
): Promise<void> {
  try {
    await supabase
      .from('user_printer_preferences')
      .upsert({
        user_id: userId,
        location_gid: locationGid,
        store_key: storeKey || null,
        printer_type: 'label',
        printer_name: config.name,
      }, { onConflict: 'user_id,printer_type' });
  } catch (error) {
    console.error('Failed to sync printer config:', error);
  }
}

export async function loadConfigFromDatabase(
  userId: string, 
  locationGid?: string
): Promise<PrinterConfig | null> {
  try {
    let query = supabase
      .from('user_printer_preferences')
      .select('printer_name')
      .eq('user_id', userId)
      .eq('printer_type', 'label');
    
    if (locationGid) {
      query = query.eq('location_gid', locationGid);
    }

    const { data } = await query.maybeSingle();

    if (data?.printer_name) {
      return { name: data.printer_name };
    }
    return null;
  } catch {
    return null;
  }
}

// Singleton service export
export const zebraService = {
  print,
  printToSystemPrinter,
  testConnection,
  pingPrinter,
  queryStatus,
  getConfig,
  saveConfig,
  clearConfig,
  checkBridgeStatus,
  getSystemPrinters,
  syncConfigToDatabase,
  loadConfigFromDatabase,
};
