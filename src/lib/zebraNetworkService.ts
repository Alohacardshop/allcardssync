interface ZebraPrinter {
  id: string;
  ip: string;
  port: number;
  name: string;
  model?: string;
  isDefault?: boolean;
  isConnected?: boolean;
  isSystemPrinter?: boolean; // USB/locally connected printer
}

interface PrintJobOptions {
  copies?: number;
  title?: string;
  timeoutMs?: number;
}

interface PrintJobResult {
  success: boolean;
  error?: string;
  message?: string;
  suggestions?: string[];
}

interface PrinterStatus {
  ready: boolean;
  paused: boolean;
  headOpen: boolean;
  mediaOut: boolean;
  ipAddr?: string;
  ssid?: string;
  raw: string;
}

// Raw network printing service - sends ZPL directly to TCP port 9100
export async function printZPL(
  zpl: string, 
  host: string, 
  port: number = 9100, 
  opts?: { timeoutMs?: number }
): Promise<PrintJobResult> {
  const timeoutMs = opts?.timeoutMs || 5000;
  const maxRetries = 3;
  const retryDelayMs = 500;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const response = await fetch('/functions/v1/zebra-tcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          host: host,
          port: port,
          data: zpl,
          expectReply: false,
          timeoutMs: timeoutMs
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.ok) {
        return {
          success: true,
          message: `Successfully printed to ${host}:${port}`
        };
      } else {
        throw new Error(result.error || 'Print failed');
      }
      
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      
      if (isLastAttempt) {
        return createActionableError(error, host, port);
      }
      
      // Wait before retry (with exponential backoff)
      await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt));
    }
  }
  
  return {
    success: false,
    error: 'Unexpected error in retry loop'
  };
}

// Status query and parsing functions
export async function queryStatus(host: string, port: number = 9100): Promise<PrinterStatus> {
  try {
    const response = await fetch('/functions/v1/zebra-tcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        host: host,
        port: port,
        data: '~HS\r\n',
        expectReply: true,
        timeoutMs: 5000
      }),
    });

    const result = await response.json();
    
    if (result.ok && result.reply) {
      return parseStatusReply(result.reply);
    } else {
      throw new Error(result.error || 'Failed to get status');
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      ready: false,
      paused: false,
      headOpen: false,
      mediaOut: false,
      raw: `Error: ${errorMsg}`
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
    
    // More comprehensive status parsing
    if (upperLine.includes('PAUSE') && !upperLine.includes('UNPAUSE')) {
      paused = true;
    }
    
    if (upperLine.includes('HEAD') && upperLine.includes('OPEN')) {
      headOpen = true;
    }
    
    if (upperLine.includes('MEDIA OUT') || 
        upperLine.includes('PAPER OUT') || 
        upperLine.includes('RIBBON OUT')) {
      mediaOut = true;
    }
    
    // Extract IP address - more flexible patterns
    const ipMatch = line.match(/IP\s*ADDRESS[:\s]*(\d+\.\d+\.\d+\.\d+)/i);
    if (ipMatch) {
      ipAddr = ipMatch[1];
    }
    
    // Extract SSID - more flexible patterns  
    const ssidMatch = line.match(/(?:WLAN\s*)?SSID[:\s]*([^\r\n]+)/i);
    if (ssidMatch) {
      ssid = ssidMatch[1].trim();
    }
  }

  const ready = !paused && !headOpen && !mediaOut;

  return {
    ready,
    paused,
    headOpen,
    mediaOut,
    ipAddr,
    ssid,
    raw: reply
  };
}

// Enhanced error handling with actionable suggestions  
function createActionableError(error: any, printerIp: string, printerPort: number): PrintJobResult {
  const errorMsg = error instanceof Error ? error.message : String(error);
  const suggestions: string[] = [];
  
  if (errorMsg.includes('not reachable') || errorMsg.includes('timeout')) {
    suggestions.push(`Open printer WebUI: http://${printerIp}`);
    suggestions.push('Try pinging the printer');
    suggestions.push('Check printer power and network connection');
  }
  
  if (errorMsg.includes('DNS') || errorMsg.includes('Bad IP/Host')) {
    suggestions.push('Verify IP address is correct');
    suggestions.push('Check network settings');
    suggestions.push('Try a different IP address');
  }
  
  return {
    success: false,
    error: errorMsg,
    suggestions
  };
}

async function testConnection(ip: string, port: number = 9100): Promise<boolean> {
  try {
    // Use the status query to test connection
    const status = await queryStatus(ip, port);
    return status.ready !== undefined; // If we got any status, connection works
  } catch (error) {
    console.log('Connection test failed:', (error as Error).message);
    return false;
  }
}

async function discoverPrinters(networkBase: string = '192.168.0'): Promise<ZebraPrinter[]> {
  const printers: ZebraPrinter[] = [];
  const commonIps = [
    `${networkBase}.100`,
    `${networkBase}.101`,
    `${networkBase}.102`,
    `${networkBase}.200`,
    `${networkBase}.201`,
    `${networkBase}.248`,
    `${networkBase}.250`
  ];

  const testPromises = commonIps.map(async (ip) => {
    const isConnected = await testConnection(ip);
    if (isConnected) {
      return {
        id: `network-${ip}`,
        ip,
        port: 9100,
        name: `Network Zebra (${ip})`,
        model: 'Network Printer',
        isConnected: true,
        isSystemPrinter: false
      };
    }
    return null;
  });

  const results = await Promise.all(testPromises);
  return results.filter((printer) => printer !== null) as ZebraPrinter[];
}

// Enhanced ZPL printing with printer object (existing API compatibility)
async function printZPLToPrinter(
  zplData: string,
  printer: ZebraPrinter,
  options: PrintJobOptions = {}
): Promise<PrintJobResult> {
  try {
    const copies = options.copies || 1;
    
    if (printer.isSystemPrinter) {
      // Print to system printer (USB/local) - would need system printing bridge
      throw new Error('System printer support not implemented in this version');
    } else {
      // Print to network printer (IP)
      return printToNetworkPrinter(zplData, printer.ip, printer.port, copies);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: `Failed to print ZPL: ${errorMsg}`
    };
  }
}

async function printToNetworkPrinter(
  zplData: string,
  printerIp: string,
  port: number,
  copies: number
): Promise<PrintJobResult> {
  let allSuccess = true;
  const errors: string[] = [];
  
  // Send each copy individually with retry logic
  for (let i = 0; i < copies; i++) {
    const result = await printZPL(zplData, printerIp, port);
    
    if (!result.success) {
      allSuccess = false;
      errors.push(`Copy ${i + 1}: ${result.error}`);
    }
  }

  return {
    success: allSuccess,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    message: allSuccess 
      ? `Successfully sent ${copies} copy(ies) to ${printerIp}:${port}` 
      : `Sent ${copies - errors.length}/${copies} copies successfully`
  };
}

class ZebraNetworkService {
  async printZPL(
    zplData: string,
    printer: ZebraPrinter,
    options: PrintJobOptions = {}
  ): Promise<PrintJobResult> {
    return printZPLToPrinter(zplData, printer, options);
  }

  async testConnection(ip: string, port: number = 9100): Promise<boolean> {
    return testConnection(ip, port);
  }

  async discoverPrinters(networkBase: string = '192.168.0'): Promise<ZebraPrinter[]> {
    return discoverPrinters(networkBase);
  }

  async printZPLDirect(
    zpl: string, 
    host: string, 
    port: number = 9100, 
    opts?: { timeoutMs?: number }
  ): Promise<PrintJobResult> {
    return printZPL(zpl, host, port, opts);
  }

  async queryStatus(host: string, port: number = 9100): Promise<PrinterStatus> {
    return queryStatus(host, port);
  }
}

export const zebraNetworkService = new ZebraNetworkService();
export type { ZebraPrinter, PrintJobOptions, PrintJobResult, PrinterStatus };