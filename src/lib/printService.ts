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

/**
 * Unified print function - all printing routes through PrintNode
 */
export async function print(zpl: string, copies: number = 1): Promise<PrintResult> {
  try {
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