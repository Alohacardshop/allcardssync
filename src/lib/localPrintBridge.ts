/**
 * Local Print Bridge Service
 * Routes print jobs through a local HTTP service that can access the printer directly
 */

export interface LocalBridgeConfig {
  bridgeUrl: string; // e.g., 'http://localhost:3001'
  printerIp: string;
  printerPort?: number;
}

export interface BridgePrintResult {
  success: boolean;
  error?: string;
  details?: string;
}

/**
 * Send ZPL through local bridge service
 */
export async function printViaLocalBridge(
  zpl: string,
  config: LocalBridgeConfig,
  copies: number = 1
): Promise<BridgePrintResult> {
  try {
    const response = await fetch(`${config.bridgeUrl}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        zpl,
        printerIp: config.printerIp,
        printerPort: config.printerPort || 9100,
        copies
      }),
      signal: AbortSignal.timeout(15000) // 15 second timeout
    });

    if (response.ok) {
      const result = await response.json();
      return {
        success: true,
        details: `Sent ${copies} label(s) via local bridge`
      };
    } else {
      return {
        success: false,
        error: `Bridge error: ${response.status}`,
        details: await response.text()
      };
    }

  } catch (error) {
    if (error instanceof Error && error.message.includes('Failed to fetch')) {
      return {
        success: false,
        error: 'Local bridge not running',
        details: 'Start the local print bridge service on port 3001'
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Bridge connection failed'
    };
  }
}

/**
 * Test local bridge connection
 */
export async function testLocalBridge(config: LocalBridgeConfig): Promise<BridgePrintResult> {
  try {
    const response = await fetch(`${config.bridgeUrl}/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      return {
        success: true,
        details: 'Local print bridge is running'
      };
    } else {
      return {
        success: false,
        error: `Bridge status: ${response.status}`
      };
    }

  } catch (error) {
    return {
      success: false,
      error: 'Bridge not accessible',
      details: 'Make sure local print bridge is running on the specified port'
    };
  }
}

export const DEFAULT_BRIDGE_CONFIG: LocalBridgeConfig = {
  bridgeUrl: 'http://localhost:3001',
  printerIp: '192.168.1.70',
  printerPort: 9100
};