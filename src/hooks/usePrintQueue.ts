import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useZebraNetwork } from './useZebraNetwork';
import { LABEL_TEMPLATES } from '@/lib/templates';
import { toast } from 'sonner';
import { PrintJobData, PrintJobTarget } from "@/types/api"

interface PrintJob {
  id: string;
  workstation_id: string;
  template_id: string | null;
  status: string;
  data: PrintJobData;
  target: PrintJobTarget;
  copies: number;
  error?: string;
  created_at: string;
  claimed_at?: string;
  printed_at?: string;
  template_version?: string;
  tspl_body?: string;
}

interface PrintQueueStatus {
  isProcessing: boolean;
  currentJob?: PrintJob;
  queueLength: number;
  totalProcessed: number;
  totalErrors: number;
}

export function usePrintQueue() {
  const [queueStatus, setQueueStatus] = useState<PrintQueueStatus>({
    isProcessing: false,
    queueLength: 0,
    totalProcessed: 0,
    totalErrors: 0
  });
  
  const { selectedPrinter, printZPL } = useZebraNetwork();
  
  // Get workstation ID for this browser
  const getWorkstationId = () => {
    let workstationId = localStorage.getItem('workstation-id');
    if (!workstationId) {
      workstationId = crypto.randomUUID().substring(0, 8);
      localStorage.setItem('workstation-id', workstationId);
    }
    return workstationId;
  };

  // Fetch queue length
  const updateQueueLength = useCallback(async () => {
    try {
      const workstationId = getWorkstationId();
      const { count } = await supabase
        .from('print_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('workstation_id', workstationId)
        .eq('status', 'queued');
      
      setQueueStatus(prev => ({ ...prev, queueLength: count || 0 }));
    } catch (error) {
      console.error('Error fetching queue length:', error);
    }
  }, []);

  // Generate ZPL from template and data
  const generateZPL = async (templateId: string | null, data: PrintJobData): Promise<string> => {
    // If no template specified, use a simple default
    if (!templateId) {
      const itemData = data.intake_item_id ? await getIntakeItemData(data.intake_item_id as string) : data;
      return generateSimpleLabel(itemData as PrintJobData);
    }

    // Get template from new label_templates_new table
    const { data: template } = await supabase
      .from('label_templates_new')
      .select('body, required_fields')
      .eq('id', templateId)
      .maybeSingle();

    if (!template) {
      // Fallback to simple template  
      const itemData = data.intake_item_id ? await getIntakeItemData(String(data.intake_item_id)) : data;
      return generateSimpleLabel(itemData as PrintJobData);
    }

    // Get intake item data if needed
    let labelData = data;
    if (data.intake_item_id) {
      const itemData = await getIntakeItemData(String(data.intake_item_id));
      labelData = { ...data, ...itemData };
    }

    // Replace placeholders in template body
    let zpl = template.body;
    
    // Simple placeholder replacement for common fields
    const replacements: Record<string, string> = {
      '{{title}}': String(labelData.title || labelData.subject || labelData.brand_title || 'Item'),
      '{{price}}': labelData.price ? `$${labelData.price}` : '$0.00',
      '{{sku}}': String(labelData.sku || ''),
      '{{barcode}}': String(labelData.sku || labelData.id || ''),
      '{{quantity}}': String(labelData.quantity || '1'),
      '{{grade}}': String(labelData.grade || ''),
      '{{card_number}}': String(labelData.card_number || ''),
      '{{category}}': String(labelData.category || ''),
      '{{lot_number}}': String(labelData.lot_number || '')
    };

    for (const [placeholder, value] of Object.entries(replacements)) {
      zpl = zpl.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }

    return zpl;
  };

  // Get intake item data
  const getIntakeItemData = async (itemId: string) => {
    const { data } = await supabase
      .from('intake_items')
      .select('*')
      .eq('id', itemId)
      .maybeSingle();
    
    return data || {};
  };

  // Generate simple fallback label
  const generateSimpleLabel = (data: PrintJobData): string => {
    const title = data.subject || data.brand_title || 'Item';
    const price = data.price ? `$${data.price}` : '$0.00';
    const sku = data.sku || data.id || '';
    
    return `
^XA
^FO50,50^A0N,40,40^FD${title}^FS
^FO50,100^A0N,30,30^FD${price}^FS
^FO50,150^BY2,3,50^BCN,80,Y,N,N^FD${sku}^FS
^XZ`;
  };

  // Process a single print job
  const processJob = async (job: PrintJob): Promise<boolean> => {
    try {
      setQueueStatus(prev => ({ 
        ...prev, 
        isProcessing: true, 
        currentJob: job 
      }));

      // Claim the job
      const { error: claimError } = await supabase
        .from('print_jobs')
        .update({ 
          status: 'claimed',
          claimed_at: new Date().toISOString()
        })
        .eq('id', job.id)
        .eq('status', 'queued'); // Only claim if still queued

      if (claimError) {
        console.log('Job already claimed by another process');
        return false;
      }

      // Update status to processing
      await supabase
        .from('print_jobs')
        .update({ status: 'processing' })
        .eq('id', job.id);

      // Generate ZPL
      const zpl = await generateZPL(job.template_id, job.data);

      if (!selectedPrinter) {
        throw new Error('No printer selected');
      }

      // Print the label
      const result = await printZPL(zpl, { copies: job.copies });

      if (result.success) {
        // Mark as printed
        await supabase
          .from('print_jobs')
          .update({ 
            status: 'printed',
            printed_at: new Date().toISOString()
          })
          .eq('id', job.id);

        setQueueStatus(prev => ({ 
          ...prev, 
          totalProcessed: prev.totalProcessed + 1 
        }));

        return true;
      } else {
        throw new Error(result.message || 'Print failed');
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Print job failed:', errorMsg);

      // Mark as error
      await supabase
        .from('print_jobs')
        .update({ 
          status: 'error',
          error: errorMsg
        })
        .eq('id', job.id);

      setQueueStatus(prev => ({ 
        ...prev, 
        totalErrors: prev.totalErrors + 1 
      }));

      toast.error(`Print failed: ${errorMsg}`);
      return false;
    }
  };

  // Process the print queue
  const processQueue = useCallback(async () => {
    if (!selectedPrinter || queueStatus.isProcessing) {
      return;
    }

    try {
      const workstationId = getWorkstationId();
      
      // Get next job in queue
      const { data: jobs } = await supabase
        .from('print_jobs')
        .select('*')
        .eq('workstation_id', workstationId)
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(1);

      if (!jobs || jobs.length === 0) {
        setQueueStatus(prev => ({ 
          ...prev, 
          isProcessing: false, 
          currentJob: undefined 
        }));
        return;
      }

      const job = jobs[0];
      // Convert Supabase Json types to our PrintJob type
      const typedJob: PrintJob = {
        ...job,
        data: (job.data as unknown) as PrintJobData,
        target: (job.target as unknown) as PrintJobTarget
      };
      await processJob(typedJob);

    } catch (error) {
      console.error('Error processing print queue:', error);
    } finally {
      setQueueStatus(prev => ({ 
        ...prev, 
        isProcessing: false, 
        currentJob: undefined 
      }));
      
      // Update queue length after processing
      await updateQueueLength();
    }
  }, [selectedPrinter, printZPL, queueStatus.isProcessing, updateQueueLength]);

  // Clear all queued jobs for this workstation
  const clearQueue = useCallback(async () => {
    try {
      const workstationId = getWorkstationId();
      await supabase
        .from('print_jobs')
        .delete()
        .eq('workstation_id', workstationId)
        .eq('status', 'queued');
      
      toast.success('Print queue cleared');
      await updateQueueLength();
    } catch (error) {
      console.error('Error clearing queue:', error);
      toast.error('Failed to clear queue');
    }
  }, [updateQueueLength]);

  // Set up polling for new jobs
  useEffect(() => {
    if (!selectedPrinter) return;

    const pollInterval = setInterval(() => {
      processQueue();
    }, 3000); // Check every 3 seconds

    // Initial queue length check
    updateQueueLength();

    return () => clearInterval(pollInterval);
  }, [selectedPrinter, processQueue, updateQueueLength]);

  // Set up realtime subscription for queue updates
  useEffect(() => {
    const workstationId = getWorkstationId();
    
    const channel = supabase
      .channel('print-queue-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'print_jobs',
          filter: `workstation_id=eq.${workstationId}`
        },
        () => {
          updateQueueLength();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [updateQueueLength]);

  return {
    queueStatus,
    clearQueue,
    processQueue
  };
}