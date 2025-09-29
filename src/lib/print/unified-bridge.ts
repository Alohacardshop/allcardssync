/**
 * Unified Print Bridge
 * Consolidates rollo-local-bridge and local-print-bridge functionality
 */

export interface PrintBridgeConfig {
  type: 'zebra' | 'rollo';
  host?: string;
  port?: number;
  printerIp?: string;
  printerPort?: number;
  printerName?: string;
}

export interface PrintJob {
  data: string; // ZPL or TSPL commands
  copies?: number;
  config: PrintBridgeConfig;
}

export interface PrintResult {
  success: boolean;
  message?: string;
  error?: string;
}

class UnifiedPrintBridge {
  private static instance: UnifiedPrintBridge;
  
  static getInstance(): UnifiedPrintBridge {
    if (!UnifiedPrintBridge.instance) {
      UnifiedPrintBridge.instance = new UnifiedPrintBridge();
    }
    return UnifiedPrintBridge.instance;
  }

  async print(job: PrintJob): Promise<PrintResult> {
    try {
      if (job.config.type === 'zebra') {
        return await this.printZebra(job);
      } else if (job.config.type === 'rollo') {
        return await this.printRollo(job);
      }
      
      throw new Error(`Unsupported printer type: ${job.config.type}`);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Print failed'
      };
    }
  }

  private async printZebra(job: PrintJob): Promise<PrintResult> {
    const { config } = job;
    const host = config.host || 'localhost';
    const port = config.port || 3001;
    
    const response = await fetch(`http://${host}:${port}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        zpl: job.data,
        printerIp: config.printerIp,
        printerPort: config.printerPort || 9100,
        copies: job.copies || 1,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    return {
      success: result.success,
      message: result.message,
      error: result.error
    };
  }

  private async printRollo(job: PrintJob): Promise<PrintResult> {
    const { config } = job;
    const host = config.host || 'localhost';
    const port = config.port || 17777;
    
    const url = new URL(`http://${host}:${port}/print`);
    if (config.printerName) {
      url.searchParams.set('printerName', config.printerName);
    }
    if (job.copies && job.copies > 1) {
      url.searchParams.set('copies', job.copies.toString());
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: job.data,
    });

    if (!response.ok) {
      const errorData = await response.text().catch(() => null);
      throw new Error(errorData || `HTTP ${response.status}`);
    }

    return {
      success: true,
      message: `Printed ${job.copies || 1} label(s) successfully`
    };
  }

  async testConnection(config: PrintBridgeConfig): Promise<PrintResult> {
    try {
      if (config.type === 'zebra') {
        return await this.testZebraConnection(config);
      } else if (config.type === 'rollo') {
        return await this.testRolloConnection(config);
      }
      
      throw new Error(`Unsupported printer type: ${config.type}`);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed'
      };
    }
  }

  private async testZebraConnection(config: PrintBridgeConfig): Promise<PrintResult> {
    const host = config.host || 'localhost';
    const port = config.port || 3001;
    
    const response = await fetch(`http://${host}:${port}/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        printerIp: config.printerIp,
        printerPort: config.printerPort || 9100,
      }),
    });

    const result = await response.json();
    return {
      success: result.success,
      message: result.message,
      error: result.error
    };
  }

  private async testRolloConnection(config: PrintBridgeConfig): Promise<PrintResult> {
    const host = config.host || 'localhost';
    const port = config.port || 17777;
    
    const response = await fetch(`http://${host}:${port}/printers`);
    
    if (!response.ok) {
      throw new Error(`Bridge not reachable at ${host}:${port}`);
    }

    const printers = await response.json();
    return {
      success: true,
      message: `Found ${printers.length} printer(s) available`
    };
  }
}

export const unifiedPrintBridge = UnifiedPrintBridge.getInstance();