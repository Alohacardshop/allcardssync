/**
 * Clean Zebra Printer Service - Direct TCP Only
 * Single source of truth for all printer operations
 */

import { supabase } from "@/integrations/supabase/client";

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

const STORAGE_KEY = 'zebra-printer-config';
const DEFAULT_PORT = 9100;

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

// Core printing function via zebra-tcp edge function
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
    const { data: response, error: supabaseError } = await supabase.functions.invoke('zebra-tcp', {
      body: {
        host: targetIp,
        port: targetPort,
        data: zpl,
        expectReply: false,
        timeoutMs: 5000
      }
    });

    if (supabaseError) {
      return { success: false, error: `Connection error: ${supabaseError.message}` };
    }

    if (response?.ok) {
      return { success: true, message: `Sent to ${targetIp}:${targetPort}` };
    }
    
    return { success: false, error: response?.error || 'Print failed' };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Test connection to printer (just checks if port is open)
export async function testConnection(ip: string, port: number = DEFAULT_PORT): Promise<boolean> {
  try {
    const { data: response, error: supabaseError } = await supabase.functions.invoke('zebra-tcp', {
      body: {
        host: ip,
        port: port,
        data: '', // Empty data just tests connection
        expectReply: false,
        timeoutMs: 2000
      }
    });

    if (supabaseError) return false;
    return response?.ok === true;
  } catch {
    return false;
  }
}

// Query printer status
export async function queryStatus(ip: string, port: number = DEFAULT_PORT): Promise<PrinterStatus> {
  try {
    const { data: response, error: supabaseError } = await supabase.functions.invoke('zebra-tcp', {
      body: {
        host: ip,
        port: port,
        data: '~HS\r\n',
        expectReply: true,
        timeoutMs: 5000
      }
    });

    if (supabaseError) {
      throw new Error(supabaseError.message);
    }

    if (response?.ok && response?.reply) {
      return parseStatusReply(response.reply);
    }
    
    throw new Error(response?.error || 'Failed to get status');
  } catch (error) {
    return {
      ready: false,
      paused: false,
      headOpen: false,
      mediaOut: false,
      raw: `Error: ${error instanceof Error ? error.message : 'Unknown'}`
    };
  }
}

function parseStatusReply(reply: string): PrinterStatus {
  const lines = reply.split(/\r?\n/);
  let paused = false;
  let headOpen = false;
  let mediaOut = false;
  let ipAddr: string | undefined;
  let ssid: string | undefined;

  for (const line of lines) {
    const upperLine = line.toUpperCase();
    
    if (upperLine.includes('PAUSE') && !upperLine.includes('UNPAUSE')) {
      paused = true;
    }
    if (upperLine.includes('HEAD') && upperLine.includes('OPEN')) {
      headOpen = true;
    }
    if (upperLine.includes('MEDIA OUT') || upperLine.includes('PAPER OUT')) {
      mediaOut = true;
    }
    
    const ipMatch = line.match(/IP\s*ADDRESS[:\s]*(\d+\.\d+\.\d+\.\d+)/i);
    if (ipMatch) ipAddr = ipMatch[1];
    
    const ssidMatch = line.match(/SSID[:\s]*([^\r\n]+)/i);
    if (ssidMatch) ssid = ssidMatch[1].trim();
  }

  return {
    ready: !paused && !headOpen && !mediaOut,
    paused,
    headOpen,
    mediaOut,
    ipAddr,
    ssid,
    raw: reply
  };
}

// Discover printers on network with progress callback
export interface DiscoveryOptions {
  networkBase?: string;
  fullScan?: boolean;
  onProgress?: (scanned: number, total: number, found: number) => void;
}

export async function discoverPrinters(
  networkBaseOrOptions?: string | DiscoveryOptions
): Promise<PrinterConfig[]> {
  // Handle both old signature and new options object
  const options: DiscoveryOptions = typeof networkBaseOrOptions === 'string' 
    ? { networkBase: networkBaseOrOptions }
    : networkBaseOrOptions || {};
  
  const networkBase = options.networkBase || '192.168.1';
  const fullScan = options.fullScan || false;
  const onProgress = options.onProgress;

  // Quick scan: common printer IPs + DHCP ranges
  const quickIps = [1, 10, 20, 50, 70, 100, 101, 102, 103, 104, 105, 
                    150, 200, 201, 202, 248, 249, 250, 251, 252, 253, 254];
  
  // Full scan: all IPs 1-254
  const ips = fullScan 
    ? Array.from({ length: 254 }, (_, i) => i + 1)
    : quickIps;
  
  const results: PrinterConfig[] = [];
  const concurrency = fullScan ? 20 : 10;
  const totalIps = ips.length;
  let scannedCount = 0;

  // Batch scan with concurrency limit
  for (let i = 0; i < ips.length; i += concurrency) {
    const batch = ips.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (lastOctet) => {
        const ip = `${networkBase}.${lastOctet}`;
        try {
          const connected = await testConnection(ip, DEFAULT_PORT);
          scannedCount++;
          onProgress?.(scannedCount, totalIps, results.length);
          return connected ? { ip, port: DEFAULT_PORT, name: `Network Printer (${ip})` } : null;
        } catch {
          scannedCount++;
          onProgress?.(scannedCount, totalIps, results.length);
          return null;
        }
      })
    );
    
    const found = batchResults.filter((p): p is PrinterConfig => p !== null);
    results.push(...found);
    
    // Update progress after each batch
    onProgress?.(scannedCount, totalIps, results.length);
  }
  
  return results;
}

// Sync config to database for persistence per user + location
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

// Load config from database for user + location
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
    
    // If location provided, prefer that location's config
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

// Singleton service export for backwards compatibility
export const zebraService = {
  print,
  testConnection,
  queryStatus,
  discoverPrinters,
  getConfig,
  saveConfig,
  clearConfig,
  syncConfigToDatabase,
  loadConfigFromDatabase,
};
