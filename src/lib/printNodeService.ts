import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface PrintNodePrinter {
  id: number;
  name: string;
  description: string;
  capabilities: string[];
  default: boolean;
  status: string;
}

export interface PrintNodeConfig {
  apiKey: string;
  printerId: number;
}

export interface PrintNodeResult {
  success: boolean;
  jobId?: number;
  error?: string;
}

class PrintNodeService {
  private baseUrl = 'https://api.printnode.com';

  private async getApiKey(): Promise<string | null> {
    try {
      logger.debug('Getting PrintNode API key from Supabase', undefined, 'printnode');
      const { data, error } = await supabase.functions.invoke('get-system-setting', {
        body: { keyName: 'PRINTNODE_API_KEY' }
      });

      if (error) {
        logger.error('Failed to get PrintNode API key', error as Error, undefined, 'printnode');
        return null;
      }

      logger.debug('PrintNode API key retrieved', { hasValue: !!data?.value }, 'printnode');
      return data?.value || null;
    } catch (error) {
      logger.error('Error getting PrintNode API key', error as Error, undefined, 'printnode');
      return null;
    }
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('PrintNode API key not configured');
    }

    logger.debug('Making PrintNode API request', { endpoint }, 'printnode');
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Basic ${btoa(apiKey + ':')}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    logger.debug('PrintNode API response', { endpoint, status: response.status }, 'printnode');

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('PrintNode API error', new Error(errorText), { endpoint, status: response.status }, 'printnode');
      throw new Error(`PrintNode API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return result;
  }

  async getPrinters(): Promise<PrintNodePrinter[]> {
    try {
      const printers = await this.makeRequest('/printers');
      return printers || [];
    } catch (error) {
      logger.error('Failed to get PrintNode printers', error as Error, undefined, 'printnode');
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      logger.info('Testing PrintNode connection', undefined, 'printnode');
      const result = await Promise.race([
        this.makeRequest('/whoami'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection test timeout')), 10000))
      ]);
      logger.info('PrintNode connection test successful', { result }, 'printnode');
      return true;
    } catch (error) {
      logger.error('PrintNode connection test failed', error as Error, undefined, 'printnode');
      return false;
    }
  }

  // UTF-8 safe base64 encoder
  private toBase64Utf8(s: string): string {
    return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  }

  async printZPL(zpl: string, printerId: number, copies: number = 1): Promise<PrintNodeResult> {
    try {
      const labelCount = (zpl.match(/\^XA/g) || []).length;
      const byteLength = new TextEncoder().encode(zpl).length;
      
      logger.info('Starting PrintNode print job', {
        printerId,
        copies,
        zplLength: zpl.length,
        byteLength,
        labelCount,
        firstChars: zpl.substring(0, 20),
        lastChars: zpl.substring(zpl.length - 20)
      }, 'printnode');
      
      // Validate ZPL for ZD410 compatibility
      if (!this.validateZD410ZPL(zpl)) {
        logger.warn('ZPL may not be ZD410 compatible', undefined, 'printnode');
      }

      // Create print job with UTF-8 safe encoding
      const printJob = {
        printer: printerId,
        title: `Batch-${labelCount}-labels-${Date.now()}`,
        contentType: 'raw_base64',
        content: this.toBase64Utf8(zpl),
        copies: copies
      };
      
      logger.debug('Submitting print job to PrintNode', {
        printer: printJob.printer,
        title: printJob.title,
        contentType: printJob.contentType,
        contentLength: printJob.content.length,
        copies: printJob.copies,
        estimatedLabels: labelCount
      }, 'printnode');

      const response = await this.makeRequest('/printjobs', {
        method: 'POST',
        body: JSON.stringify(printJob),
      });

      // Extract job ID with better error handling
      let jobId = null;
      if (Array.isArray(response)) {
        jobId = response[0]?.id || response[0];
      } else if (response?.id) {
        jobId = response.id;
      } else if (typeof response === 'number') {
        jobId = response;
      } else if (typeof response === 'string') {
        jobId = response;
      }

      logger.info('PrintNode job submitted successfully', { jobId, labelCount }, 'printnode');

      return {
        success: true,
        jobId: jobId || 'Unknown',
      };
    } catch (error) {
      logger.error('PrintNode print failed', error as Error, undefined, 'printnode');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown PrintNode error',
      };
    }
  }

  /**
   * Validate ZPL commands for ZD410 compatibility
   */
  private validateZD410ZPL(zpl: string): boolean {
    const hasStart = zpl.includes('^XA');
    const hasEnd = zpl.includes('^XZ');
    const hasCutterMode = zpl.includes('^MMC'); // Optional but recommended
    const hasMediaType = zpl.includes('^MTD'); // Direct thermal for ZD410
    const hasMediaTracking = zpl.includes('^MNN') || zpl.includes('^MNY'); // Continuous or gap media
    const hasPrintQuantity = zpl.includes('^PQ');
    
    logger.debug('ZPL validation check', {
      hasStart,
      hasEnd,
      hasCutterMode,
      hasMediaType,
      hasMediaTracking,
      hasPrintQuantity
    }, 'printnode');
    
    // Cutter mode is optional - ZD410 will work without it
    return hasStart && hasEnd && hasMediaType && hasMediaTracking && hasPrintQuantity;
  }

  async getJobStatus(jobId: number): Promise<any> {
    try {
      return await this.makeRequest(`/printjobs/${jobId}`);
    } catch (error) {
      logger.error('Failed to get PrintNode job status', error as Error, { jobId }, 'printnode');
      throw error;
    }
  }
}

export const printNodeService = new PrintNodeService();