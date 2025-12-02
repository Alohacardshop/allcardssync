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

// Test connection to printer
export async function testConnection(ip: string, port: number = DEFAULT_PORT): Promise<boolean> {
  try {
    const status = await queryStatus(ip, port);
    return status.ready !== undefined;
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

// Discover printers on network
export async function discoverPrinters(networkBase: string = '192.168.0'): Promise<PrinterConfig[]> {
  const commonIps = [
    `${networkBase}.100`, `${networkBase}.101`, `${networkBase}.102`,
    `${networkBase}.200`, `${networkBase}.201`, `${networkBase}.248`, `${networkBase}.250`
  ];

  const results = await Promise.all(
    commonIps.map(async (ip) => {
      const connected = await testConnection(ip);
      return connected ? { ip, port: DEFAULT_PORT, name: `Zebra (${ip})` } : null;
    })
  );

  return results.filter((p): p is PrinterConfig => p !== null);
}

// Sync config to database for persistence across workstations
export async function syncConfigToDatabase(config: PrinterConfig): Promise<void> {
  try {
    let workstationId = localStorage.getItem('workstation-id');
    if (!workstationId) {
      workstationId = crypto.randomUUID().substring(0, 8);
      localStorage.setItem('workstation-id', workstationId);
    }

    await supabase
      .from('printer_settings')
      .upsert({
        workstation_id: workstationId,
        printer_ip: config.ip,
        printer_port: config.port,
        printer_name: config.name,
        use_printnode: false,
      }, { onConflict: 'workstation_id' });
  } catch (error) {
    console.error('Failed to sync printer config:', error);
  }
}

// Load config from database
export async function loadConfigFromDatabase(): Promise<PrinterConfig | null> {
  try {
    const workstationId = localStorage.getItem('workstation-id');
    if (!workstationId) return null;

    const { data } = await supabase
      .from('printer_settings')
      .select('printer_ip, printer_port, printer_name')
      .eq('workstation_id', workstationId)
      .maybeSingle();

    if (data?.printer_ip) {
      return {
        ip: data.printer_ip,
        port: data.printer_port || DEFAULT_PORT,
        name: data.printer_name || `Zebra (${data.printer_ip})`
      };
    }
    return null;
  } catch {
    return null;
  }
}
