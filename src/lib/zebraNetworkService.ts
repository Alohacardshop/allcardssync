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
}

interface PrintJobResult {
  success: boolean;
  error?: string;
  message?: string;
  suggestions?: string[];
}

class ZebraNetworkService {
  private bridgeUrl = 'http://127.0.0.1:17777';
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 500;
  
  // Direct ZPL printing to host:port (new simplified API as requested)
  async printZPLDirect(
    zpl: string, 
    host: string, 
    port: number = 9100, 
    opts?: { timeoutMs?: number }
  ): Promise<PrintJobResult> {
    const timeoutMs = opts?.timeoutMs || 5000;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        const response = await fetch(`${this.bridgeUrl}/rawtcp?ip=${host}&port=${port}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
          },
          body: zpl,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
          return {
            success: true,
            message: `Successfully printed to ${host}:${port}`
          };
        } else {
          throw new Error(this.parseNetworkError(result.error || 'Print failed'));
        }
        
      } catch (error) {
        const isLastAttempt = attempt === this.maxRetries;
        const errorMsg = this.parseNetworkError(error);
        
        if (isLastAttempt) {
          return this.createActionableError(error, host, port);
        }
        
        // Wait before retry (with exponential backoff)
        await new Promise(resolve => setTimeout(resolve, this.retryDelayMs * attempt));
      }
    }
    
    return {
      success: false,
      error: 'Unexpected error in retry loop'
    };
  }
  
  private parseNetworkError(error: any): string {
    const errorStr = error instanceof Error ? error.message : String(error);
    
    if (errorStr.includes('ENOTFOUND') || errorStr.includes('getaddrinfo')) {
      return 'DNS resolution failed - check hostname/IP address. Try using the IP address directly instead of a hostname.';
    }
    if (errorStr.includes('ECONNREFUSED')) {
      return 'Connection refused - printer may be offline or port blocked. Check if printer is on and connected to network.';
    }
    if (errorStr.includes('timeout') || errorStr.includes('ETIMEDOUT')) {
      return 'Connection timeout - printer not responding. Check Wi-Fi signal strength and network connectivity.';
    }
    if (errorStr.includes('EHOSTUNREACH')) {
      return 'Host unreachable - check network connectivity. Ensure printer and computer are on the same network.';
    }
    if (errorStr.includes('ENETUNREACH')) {
      return 'Network unreachable - check routing/firewall settings. Try disabling VPN if active.';
    }
    if (errorStr.includes('aborted')) {
      return 'Request timed out - printer took too long to respond.';
    }
    
    return errorStr;
  }

  // Enhanced error handling with actionable suggestions
  private createActionableError(error: any, printerIp: string, printerPort: number): PrintJobResult {
    const errorMsg = this.parseNetworkError(error);
    const suggestions: string[] = [];
    
    if (errorMsg.includes('Connection refused') || errorMsg.includes('timeout')) {
      suggestions.push(`Open printer WebUI: http://${printerIp}`);
      suggestions.push('Try pinging the printer');
      suggestions.push('Check printer power and network connection');
    }
    
    if (errorMsg.includes('DNS') || errorMsg.includes('Host unreachable')) {
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

  async testConnection(ip: string, port: number = 9100): Promise<boolean> {
    try {
      const response = await fetch(`${this.bridgeUrl}/check-tcp?ip=${ip}&port=${port}`);
      const result = await response.json();
      return result.ok === true;
    } catch (error) {
      console.error('TCP connection test failed:', error);
      return false;
    }
  }

  // Enhanced ZPL printing with printer object (existing API compatibility)
  async printZPL(
    zplData: string,
    printer: ZebraPrinter,
    options: PrintJobOptions = {}
  ): Promise<PrintJobResult> {
    try {
      const copies = options.copies || 1;
      
      if (printer.isSystemPrinter) {
        // Print to system printer (USB/local)
        return this.printToSystemPrinter(zplData, printer, copies);
      } else {
        // Print to network printer (IP)
        return this.printToNetworkPrinter(zplData, printer.ip, printer.port, copies);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to print ZPL: ${errorMsg}`
      };
    }
  }

  private async printToSystemPrinter(
    zplData: string,
    printer: ZebraPrinter,
    copies: number
  ): Promise<PrintJobResult> {
    try {
      const response = await fetch(`${this.bridgeUrl}/system-print`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          printerName: printer.name,
          zplData: zplData,
          copies: copies
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        return {
          success: true,
          message: `Successfully sent ${copies} copy(ies) to ${printer.name}`
        };
      } else {
        return {
          success: false,
          error: result.error || 'System print failed'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'System print failed'
      };
    }
  }

  private async printToNetworkPrinter(
    zplData: string,
    printerIp: string,
    port: number,
    copies: number
  ): Promise<PrintJobResult> {
    let allSuccess = true;
    const errors: string[] = [];
    
    // Send each copy individually with retry logic
    for (let i = 0; i < copies; i++) {
      const result = await this.printZPLDirect(zplData, printerIp, port);
      
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

  async discoverPrinters(networkBase: string = '192.168.0'): Promise<ZebraPrinter[]> {
    const printers: ZebraPrinter[] = [];
    
    try {
      // First, try to get system/USB printers via the bridge
      const systemPrinters = await this.getSystemPrinters();
      printers.push(...systemPrinters);
      
      // Then scan for network printers if requested
      const networkPrinters = await this.scanNetworkPrinters(networkBase);
      printers.push(...networkPrinters);
      
    } catch (error) {
      console.error('Printer discovery failed:', error);
    }
    
    return printers;
  }

  async getSystemPrinters(): Promise<ZebraPrinter[]> {
    try {
      const response = await fetch(`${this.bridgeUrl}/system-printers`);
      const result = await response.json();
      
      if (result.success && result.printers) {
        return result.printers.map((printer: any) => ({
          id: `system-${printer.name.replace(/\s+/g, '-')}`,
          ip: 'localhost', // System printer
          port: 0, // Not applicable for system printers
          name: printer.name,
          model: printer.model || 'System Printer',
          isConnected: printer.status === 'ready',
          isSystemPrinter: true
        }));
      }
      
      return [];
    } catch (error) {
      console.error('System printer discovery failed:', error);
      return [];
    }
  }

  async scanNetworkPrinters(networkBase: string): Promise<ZebraPrinter[]> {
    // Network IP scanning (existing logic)
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
      const isConnected = await this.testConnection(ip);
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

  async getPrinterStatus(ip: string, port: number = 9100): Promise<{ 
    connected: boolean; 
    status?: string; 
    error?: string; 
  }> {
    try {
      const connected = await this.testConnection(ip, port);
      return {
        connected,
        status: connected ? 'Ready' : 'Offline'
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Send ZPL status command to get printer information
  async queryPrinterInfo(ip: string, port: number = 9100): Promise<{
    model?: string;
    serialNumber?: string;
    firmware?: string;
    error?: string;
  }> {
    try {
      // ZPL command to query printer configuration
      const statusCommand = '^XA^HH^XZ'; // Host identification command
      
      const response = await fetch(`${this.bridgeUrl}/rawtcp?ip=${ip}&port=${port}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: statusCommand,
      });

      const result = await response.json();
      
      if (result.success) {
        // In a real implementation, you would parse the response to get printer info
        // For now, return basic info
        return {
          model: 'Zebra Printer',
          serialNumber: 'Unknown',
          firmware: 'Unknown'
        };
      } else {
        return {
          error: result.error || 'Failed to query printer info'
        };
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Failed to query printer'
      };
    }
  }
}

export const zebraNetworkService = new ZebraNetworkService();
export type { ZebraPrinter, PrintJobOptions, PrintJobResult };