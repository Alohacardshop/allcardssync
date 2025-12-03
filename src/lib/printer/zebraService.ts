/**
 * Zebra Printer Service - Local Bridge Only
 * Uses rollo-local-bridge on localhost:17777 for all printer operations
 */

// Use 127.0.0.1 for better compatibility with HTTPS pages
const BRIDGE_URL = 'http://127.0.0.1:17777';
const STORAGE_KEY = 'zebra-printer-config';
const DEFAULT_PORT = 9100;

// Types
export interface PrinterConfig {
  ip: string;
  port: number;
  name: string;
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
  ipAddr?: string;
  ssid?: string;
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

// Check if local bridge is running
export async function checkBridgeStatus(): Promise<BridgeStatus> {
  console.log('[Bridge] Checking status...');
  
  // Try multiple endpoints - older EXE versions may not have /status
  const endpoints = [
    `${BRIDGE_URL}/status`,
    BRIDGE_URL,
    `${BRIDGE_URL}/`
  ];
  
  for (const url of endpoints) {
    try {
      console.log('[Bridge] Trying:', url);
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      
      console.log('[Bridge] Response from', url, ':', response.status);
      
      if (response.ok) {
        try {
          const data = await response.json();
          console.log('[Bridge] Connected successfully:', data);
          return { connected: true, version: data.version || 'unknown' };
        } catch {
          // Response wasn't JSON but connection worked
          console.log('[Bridge] Connected (non-JSON response)');
          return { connected: true, version: 'unknown' };
        }
      }
    } catch (error) {
      console.log('[Bridge] Error for', url, ':', error);
      // Continue to next endpoint
    }
  }
  
  console.log('[Bridge] All endpoints failed');
  return { connected: false, error: 'Bridge not running or not reachable' };
}

// Get system/USB printers via local bridge
export async function getSystemPrinters(): Promise<SystemPrinter[]> {
  try {
    const response = await fetch(`${BRIDGE_URL}/system-printers`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.printers || [];
    }
    
    return [];
  } catch {
    return [];
  }
}

// Core printing function via local bridge
export async function print(zpl: string, ip?: string, port?: number): Promise<PrintResult> {
  const config = getConfig();
  const targetIp = ip || config?.ip;
  const targetPort = port || config?.port || DEFAULT_PORT;
  
  if (!targetIp) {
    return { 
      success: false, 
      error: 'No printer configured. Please set up printer IP in Settings.' 
    };
  }

  try {
    const response = await fetch(`${BRIDGE_URL}/rawtcp?ip=${encodeURIComponent(targetIp)}&port=${targetPort}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: zpl,
      signal: AbortSignal.timeout(10000)
    });

    const data = await response.json();
    
    if (data.success) {
      return { success: true, message: data.message || `Sent to ${targetIp}:${targetPort}` };
    }
    
    return { success: false, error: data.error || 'Print failed' };
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return { success: false, error: 'Print timeout - check printer connection' };
    }
    if (error instanceof Error && error.message.includes('Failed to fetch')) {
      return { 
        success: false, 
        error: 'Local print bridge not running. Start ZebraPrintBridge.exe on this computer.' 
      };
    }
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Print to system/USB printer via local bridge
export async function printToSystemPrinter(zpl: string, printerName: string, copies: number = 1): Promise<PrintResult> {
  try {
    const response = await fetch(`${BRIDGE_URL}/system-print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printerName, zplData: zpl, copies }),
      signal: AbortSignal.timeout(10000)
    });

    const data = await response.json();
    
    if (data.success) {
      return { success: true, message: data.message };
    }
    
    return { success: false, error: data.error || 'Print failed' };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Failed to fetch')) {
      return { 
        success: false, 
        error: 'Local print bridge not running. Start ZebraPrintBridge.exe on this computer.' 
      };
    }
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Test connection to network printer via local bridge
export async function testConnection(ip: string, port: number = DEFAULT_PORT): Promise<boolean> {
  try {
    const response = await fetch(`${BRIDGE_URL}/check-tcp?ip=${encodeURIComponent(ip)}&port=${port}`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });

    const data = await response.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

// Ping test via local bridge
export async function pingPrinter(ip: string): Promise<{ success: boolean; latency?: number; error?: string }> {
  try {
    const response = await fetch(`${BRIDGE_URL}/ping?ip=${encodeURIComponent(ip)}`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });

    const data = await response.json();
    return {
      success: data.success,
      latency: data.latency,
      error: data.error
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Ping failed' 
    };
  }
}

// Query printer status (sends ~HS command and parses response)
// Note: This requires the printer to respond, which may not work via simple TCP
export async function queryStatus(ip: string, port: number = DEFAULT_PORT): Promise<PrinterStatus> {
  // For now, just check if we can connect
  const connected = await testConnection(ip, port);
  
  return {
    ready: connected,
    paused: false,
    headOpen: false,
    mediaOut: false,
    raw: connected ? 'Connected' : 'Not connected'
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
        printer_ip: config.ip,
        printer_port: config.port,
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
      .select('printer_ip, printer_port, printer_name')
      .eq('user_id', userId)
      .eq('printer_type', 'label');
    
    if (locationGid) {
      query = query.eq('location_gid', locationGid);
    }

    const { data } = await query.maybeSingle();

    if (data?.printer_ip) {
      return {
        ip: data.printer_ip,
        port: data.printer_port || DEFAULT_PORT,
        name: data.printer_name || `Printer (${data.printer_ip})`
      };
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
