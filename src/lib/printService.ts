/**
 * Unified Print Service
 * Single transport layer for all printing - routes exclusively through PrintNode
 */

import { printNodeService } from '@/lib/printNodeService';
import { toast } from 'sonner';

export interface PrintResult {
  success: boolean;
  jobId?: number;
  error?: string;
}

// Stock mode configuration
export interface StockModeConfig {
  mode: 'gap' | 'continuous';
  speed?: number;
  darkness?: number;
}

// Get stock mode from localStorage
function getStockModeConfig(): StockModeConfig {
  try {
    const saved = localStorage.getItem('zebra-stock-config');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.warn('Failed to load stock config:', error);
  }
  
  // Default configuration
  return {
    mode: 'gap',
    speed: 4,
    darkness: 10
  };
}

// Save stock mode to localStorage
export function saveStockModeConfig(config: StockModeConfig): void {
  try {
    localStorage.setItem('zebra-stock-config', JSON.stringify(config));
  } catch (error) {
    console.warn('Failed to save stock config:', error);
  }
}

/**
 * Unified print function - all printing routes through PrintNode
 * Now applies stock mode configuration automatically
 */
export async function print(zpl: string, copies: number = 1): Promise<PrintResult> {
  try {
    // Log the exact ZPL being sent
    console.log('🖨️ Exact ZPL being sent to printer:');
    console.log('='.repeat(50));
    console.log(zpl);
    console.log('='.repeat(50));
    console.log(`📋 ZPL Length: ${zpl.length} characters`);
    console.log(`🔢 Copies: ${copies}`);
    
    // Get saved PrintNode configuration
    const savedConfig = localStorage.getItem('zebra-printer-config');
    if (!savedConfig) {
      throw new Error('No PrintNode printer configured. Please configure in Admin > Test Hardware.');
    }
    
    const config = JSON.parse(savedConfig);
    if (!config.usePrintNode || !config.printNodeId) {
      throw new Error('PrintNode not properly configured. Please reconfigure in Admin > Test Hardware.');
    }

    // Send to PrintNode
    const result = await printNodeService.printZPL(zpl, config.printNodeId, copies);
    
    if (result.success) {
      return {
        success: true,
        jobId: result.jobId
      };
    } else {
      return {
        success: false,
        error: result.error || 'Print failed'
      };
    }
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Test connection to PrintNode service
 */
export async function testPrintConnection(): Promise<boolean> {
  try {
    return await printNodeService.testConnection();
  } catch (error) {
    console.error('Print connection test failed:', error);
    return false;
  }
}