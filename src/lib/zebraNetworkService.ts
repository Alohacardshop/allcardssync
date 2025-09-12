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
}

class ZebraNetworkService {
  private bridgeUrl = 'http://127.0.0.1:17777';
  
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
    
    // Send each copy individually for better error handling
    for (let i = 0; i < copies; i++) {
      try {
        const response = await fetch(`${this.bridgeUrl}/rawtcp?ip=${printerIp}&port=${port}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
          },
          body: zplData,
        });

        const result = await response.json();
        
        if (!result.success) {
          allSuccess = false;
          errors.push(`Copy ${i + 1}: ${result.error || 'Unknown error'}`);
        }
      } catch (error) {
        allSuccess = false;
        const errorMsg = error instanceof Error ? error.message : 'Network error';
        errors.push(`Copy ${i + 1}: ${errorMsg}`);
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