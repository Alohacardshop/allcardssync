import { supabase } from '@/integrations/supabase/client';

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
      const { data, error } = await supabase.functions.invoke('get-system-setting', {
        body: { keyName: 'PRINTNODE_API_KEY' }
      });

      if (error) {
        console.error('Failed to get PrintNode API key:', error);
        return null;
      }

      return data?.value || null;
    } catch (error) {
      console.error('Error getting PrintNode API key:', error);
      return null;
    }
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('PrintNode API key not configured');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Basic ${btoa(apiKey + ':')}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PrintNode API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async getPrinters(): Promise<PrintNodePrinter[]> {
    try {
      const printers = await this.makeRequest('/printers');
      return printers || [];
    } catch (error) {
      console.error('Failed to get PrintNode printers:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.makeRequest('/whoami');
      return true;
    } catch (error) {
      console.error('PrintNode connection test failed:', error);
      return false;
    }
  }

  async printZPL(zpl: string, printerId: number, copies: number = 1): Promise<PrintNodeResult> {
    try {
      console.log('🖨️ PrintNode: Sending ZPL to printer', { printerId, copies });

      const printJob = {
        printer: printerId,
        title: 'Label Print Job',
        contentType: 'raw_base64',
        content: btoa(zpl),
        copies: copies
      };

      const response = await this.makeRequest('/printjobs', {
        method: 'POST',
        body: JSON.stringify(printJob),
      });

      console.log('🖨️ PrintNode: Print job created', response);

      return {
        success: true,
        jobId: response.id || response[0]?.id,
      };
    } catch (error) {
      console.error('PrintNode print failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown PrintNode error',
      };
    }
  }

  async getJobStatus(jobId: number): Promise<any> {
    try {
      return await this.makeRequest(`/printjobs/${jobId}`);
    } catch (error) {
      console.error('Failed to get PrintNode job status:', error);
      throw error;
    }
  }
}

export const printNodeService = new PrintNodeService();