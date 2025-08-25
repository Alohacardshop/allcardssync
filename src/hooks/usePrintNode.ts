
import { useState, useEffect, useCallback } from 'react';
import { printNodeService } from '@/lib/printNodeService';
import { toast } from 'sonner';
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

export function usePrintNode() {
  const [printers, setPrinters] = useState<PrintNodePrinter[]>([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionError, setConnectionError] = useState<string>('');

  // Get or create consistent workstation ID
  const getWorkstationId = () => {
    let workstationId = localStorage.getItem('workstation-id');
    if (!workstationId) {
      workstationId = crypto.randomUUID().substring(0, 8);
      localStorage.setItem('workstation-id', workstationId);
    }
    return workstationId;
  };

  // Load saved printer selection from database first, then localStorage
  const loadSavedPrinter = useCallback(async () => {
    try {
      // First try to load from database (PrinterPanel settings)
      const workstationId = getWorkstationId();
      const { data: settings } = await supabase
        .from('printer_settings')
        .select('selected_printer_id')
        .eq('workstation_id', workstationId)
        .order('updated_at', { ascending: false })
        .maybeSingle();
      
      if (settings?.selected_printer_id) {
        setSelectedPrinterId(settings.selected_printer_id);
        // Sync to localStorage for consistency
        localStorage.setItem('printnode-selected-printer', settings.selected_printer_id.toString());
        return;
      }
    } catch (error) {
      console.log('No database printer settings found, checking localStorage');
    }
    
    // Fallback to localStorage if no database setting found
    const saved = localStorage.getItem('printnode-selected-printer');
    if (saved) setSelectedPrinterId(parseInt(saved));
  }, []);

  // Save printer selection to both localStorage and database
  useEffect(() => {
    if (selectedPrinterId) {
      localStorage.setItem('printnode-selected-printer', selectedPrinterId.toString());
      
      // Also save to database for consistency with PrinterPanel
      const syncToDatabase = async () => {
        try {
          const workstationId = getWorkstationId();
          const selectedPrinter = printers.find(p => p.id === selectedPrinterId);
          if (selectedPrinter) {
            await supabase
              .from('printer_settings')
              .upsert({
                workstation_id: workstationId,
                selected_printer_id: selectedPrinterId,
                selected_printer_name: selectedPrinter.name,
                use_printnode: true,
              }, {
                onConflict: 'workstation_id'
              });
          }
        } catch (error) {
          console.log('Could not sync printer setting to database:', error);
        }
      };
      
      if (printers.length > 0) {
        syncToDatabase();
      }
    }
  }, [selectedPrinterId, printers]);

  const refreshPrinters = useCallback(async (showToast = false) => {
    setIsLoading(true);
    setConnectionError('');
    try {
      const printerList = await printNodeService.getPrinters();
      setPrinters(printerList);
      setIsConnected(true);
      
      // Prefer saved selection only; never auto-select first
      const saved = localStorage.getItem('printnode-selected-printer');
      if (!selectedPrinterId && saved && printerList.find(p => p.id === parseInt(saved))) {
        setSelectedPrinterId(parseInt(saved));
      }
      
      if (showToast) {
        toast.success(`PrintNode connected - Found ${printerList.length} printer(s)`);
      }
    } catch (error) {
      setIsConnected(false);
      setPrinters([]);
      const errorMessage = error instanceof Error ? error.message : "Failed to connect to PrintNode";
      setConnectionError(errorMessage);
      if (showToast) {
        toast.error(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedPrinterId]);

  // Initialize on mount: load saved selection first, then refresh printers
  useEffect(() => {
    (async () => {
      await loadSavedPrinter();
      await refreshPrinters();
    })();
  }, [loadSavedPrinter, refreshPrinters]);

  const printPDF = useCallback(async (pdfBase64: string, options?: { title?: string; copies?: number }) => {
    if (!selectedPrinterId) {
      throw new Error('No printer selected');
    }
    return printNodeService.printPDF(pdfBase64, selectedPrinterId, options);
  }, [selectedPrinterId]);

  const printRAW = useCallback(async (rawText: string, options?: { title?: string; copies?: number }) => {
    if (!selectedPrinterId) {
      throw new Error('No printer selected');
    }
    return printNodeService.printRAW(rawText, selectedPrinterId, options);
  }, [selectedPrinterId]);

  const printPNG = useCallback(async (pngBlob: Blob, options?: { title?: string; copies?: number }) => {
    if (!selectedPrinterId) {
      throw new Error('No printer selected');
    }
    return printNodeService.printPNG(pngBlob, selectedPrinterId, options);
  }, [selectedPrinterId]);

  const selectedPrinter = printers.find(p => p.id === selectedPrinterId) || null;

  return {
    printers,
    selectedPrinter,
    selectedPrinterId,
    setSelectedPrinterId,
    isConnected,
    isLoading,
    connectionError,
    refreshPrinters,
    printPDF,
    printRAW,
    printPNG
  };
}
