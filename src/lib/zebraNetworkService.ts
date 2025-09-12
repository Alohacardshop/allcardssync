interface ZebraPrinter {
  id: string;
  ip: string;
  port: number;
  name: string;
  model?: string;
  isDefault?: boolean;
  isConnected?: boolean;
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
    printerIp: string,
    port: number = 9100,
    options: PrintJobOptions = {}
  ): Promise<PrintJobResult> {
    try {
      const copies = options.copies || 1;
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
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to print ZPL: ${errorMsg}`
      };
    }
  }

  async discoverPrinters(networkBase: string = '192.168.0'): Promise<ZebraPrinter[]> {
    // Simple discovery by testing common IP ranges
    // In a real implementation, you might want to use SNMP or other discovery methods
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
          id: `zebra-${ip}`,
          ip,
          port: 9100,
          name: `Zebra Printer (${ip})`,
          model: 'Unknown',
          isConnected: true
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