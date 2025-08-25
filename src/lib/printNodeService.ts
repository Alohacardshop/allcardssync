import { supabase } from '@/integrations/supabase/client';

interface PrintNodePrinter {
  id: number;
  name: string;
  description: string;
  capabilities: string[];
  default: boolean;
  createTimestamp: string;
  state: string;
}

interface PrintNodeJob {
  id: number;
  printer: PrintNodePrinter;
  title: string;
  contentType: string;
  source: string;
  createTimestamp: string;
  state: string;
}

interface PrintJobOptions {
  copies?: number;
  title?: string;
}

interface PrintJobResult {
  jobId: number;
  success: boolean;
  error?: string;
}

class PrintNodeService {
  private apiKey: string | null = null;
  private baseUrl = 'https://api.printnode.com';

  async initialize(): Promise<void> {
    // Get API key from Supabase edge function
    const { data, error } = await supabase.functions.invoke('get-printnode-key');
    
    if (error) {
      console.error('Edge function error:', error);
      throw new Error(`Failed to retrieve PrintNode API key: ${error.message}`);
    }
    
    if (!data?.success || !data?.apiKey) {
      const errorMsg = data?.error || 'PrintNode API key not configured';
      throw new Error(errorMsg);
    }
    
    this.apiKey = data.apiKey;
    console.log(`PrintNode initialized with ${data.keySource} API key`);
  }

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.apiKey) {
      await this.initialize();
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Basic ${btoa(this.apiKey + ':')}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`PrintNode API error: ${response.statusText}`);
    }

    return response.json();
  }

  async getPrinters(): Promise<PrintNodePrinter[]> {
    return this.makeRequest<PrintNodePrinter[]>('/printers');
  }

  async printPDF(
    pdfBase64: string,
    printerId: number,
    options: PrintJobOptions = {}
  ): Promise<PrintJobResult> {
    try {
      const printJob = {
        printerId,
        title: options.title || 'Label Print',
        contentType: 'pdf_base64',
        content: pdfBase64,
        source: 'web-app',
        ...(options.copies && { qty: options.copies })
      };

      const result = await this.makeRequest<PrintNodeJob>('/printjobs', {
        method: 'POST',
        body: JSON.stringify(printJob),
      });

      return {
        jobId: result.id,
        success: true
      };
    } catch (error) {
      return {
        jobId: -1,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async printRAW(
    rawText: string,
    printerId: number,
    options: PrintJobOptions = {}
  ): Promise<PrintJobResult> {
    try {
      // Use the exact encoding method specified in the checklist
      const contentBase64 = btoa(unescape(encodeURIComponent(rawText)));
      
      const printJob = {
        printerId,
        title: options.title || 'Label RAW',
        contentType: 'raw_base64',
        content: contentBase64,
        source: 'web-app',
        qty: options.copies || 1
      };

      console.log('PrintNode RAW job payload:', {
        printerId,
        title: printJob.title,
        contentType: printJob.contentType,
        qty: printJob.qty,
        source: printJob.source,
        contentLength: contentBase64.length
      });

      const result = await this.makeRequest<PrintNodeJob>('/printjobs', {
        method: 'POST',
        body: JSON.stringify(printJob),
      });

      return {
        jobId: result.id,
        success: true
      };
    } catch (error) {
      return {
        jobId: -1,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async printPNG(
    pngBlob: Blob,
    printerId: number,
    options: PrintJobOptions = {}
  ): Promise<PrintJobResult> {
    try {
      // Convert blob to base64
      const arrayBuffer = await pngBlob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      
      const printJob = {
        printerId,
        title: options.title || 'Label PNG',
        contentType: 'png_base64',
        content: base64,
        source: 'web-app',
        qty: options.copies || 1
      };

      console.log('PrintNode PNG job payload:', {
        printerId,
        title: printJob.title,
        contentType: printJob.contentType,
        qty: printJob.qty,
        source: printJob.source,
        contentSize: base64.length
      });

      const result = await this.makeRequest<PrintNodeJob>('/printjobs', {
        method: 'POST',
        body: JSON.stringify(printJob),
      });

      return {
        jobId: result.id,
        success: true
      };
    } catch (error) {
      return {
        jobId: -1,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getJobStatus(jobId: number): Promise<PrintNodeJob> {
    return this.makeRequest<PrintNodeJob>(`/printjobs/${jobId}`);
  }
}

export const printNodeService = new PrintNodeService();