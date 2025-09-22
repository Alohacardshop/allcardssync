import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { printNodeService, PrintNodePrinter } from '@/lib/printNodeService';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PrintNodeContextType {
  isConnected: boolean;
  isLoading: boolean;
  printers: PrintNodePrinter[];
  selectedPrinterId: string;
  apiKey: string;
  testConnection: () => Promise<void>;
  saveApiKey: (key: string) => Promise<void>;
  setSelectedPrinterId: (id: string) => void;
  refreshPrinters: () => Promise<void>;
}

const PrintNodeContext = createContext<PrintNodeContextType | undefined>(undefined);

export function PrintNodeProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [printers, setPrinters] = useState<PrintNodePrinter[]>([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState<string>('');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      // Load API key
      const { data: keyData, error } = await supabase.functions.invoke('get-system-setting', {
        body: { keyName: 'PRINTNODE_API_KEY' }
      });
      
      if (!error && keyData?.value) {
        setApiKey(keyData.value);
        await testConnection();
      }

      // Load saved printer
      const savedConfig = localStorage.getItem('zebra-printer-config');
      if (savedConfig) {
        try {
          const config = JSON.parse(savedConfig);
          if (config.printNodeId && config.usePrintNode) {
            setSelectedPrinterId(config.printNodeId.toString());
          }
        } catch (error) {
          console.error('Failed to parse saved printer config:', error);
        }
      }
    } catch (error) {
      console.error('Failed to load PrintNode settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const testConnection = async () => {
    try {
      const connected = await printNodeService.testConnection();
      setIsConnected(connected);
      
      if (connected) {
        await loadPrinters();
      }
    } catch (error) {
      console.error('PrintNode connection test failed:', error);
      setIsConnected(false);
    }
  };

  const loadPrinters = async () => {
    try {
      const printerList = await printNodeService.getPrinters();
      setPrinters(printerList);
      
      // Auto-select first online printer if none selected
      if (!selectedPrinterId && printerList.length > 0) {
        const onlinePrinter = printerList.find(p => p.status === 'online') || printerList[0];
        updateSelectedPrinter(onlinePrinter.id.toString());
      }
    } catch (error) {
      console.error('Failed to load printers:', error);
    }
  };

  const saveApiKey = async (key: string) => {
    if (!key.trim()) {
      toast.error('Please enter an API key');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('set-system-setting', {
        body: { 
          keyName: 'PRINTNODE_API_KEY',
          keyValue: key.trim(),
          description: 'PrintNode API key for cloud printing',
          category: 'printing'
        }
      });

      if (error) throw error;

      setApiKey(key.trim());
      toast.success('PrintNode API key saved');
      await testConnection();
    } catch (error) {
      console.error('Failed to save API key:', error);
      toast.error('Failed to save API key');
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const updateSelectedPrinter = (printerId: string) => {
    setSelectedPrinterId(printerId);
    
    const printer = printers.find(p => p.id.toString() === printerId);
    if (printer) {
      const currentConfig = localStorage.getItem('zebra-printer-config');
      const config = currentConfig ? JSON.parse(currentConfig) : {};
      
      const updatedConfig = {
        ...config,
        name: printer.name,
        printNodeId: printer.id,
        usePrintNode: true
      };
      
      localStorage.setItem('zebra-printer-config', JSON.stringify(updatedConfig));
      toast.success(`Selected PrintNode printer: ${printer.name}`);
    }
  };

  const refreshPrinters = async () => {
    await loadPrinters();
  };

  return (
    <PrintNodeContext.Provider value={{
      isConnected,
      isLoading,
      printers,
      selectedPrinterId,
      apiKey,
      testConnection,
      saveApiKey,
      setSelectedPrinterId: updateSelectedPrinter,
      refreshPrinters
    }}>
      {children}
    </PrintNodeContext.Provider>
  );
}

export function usePrintNode() {
  const context = useContext(PrintNodeContext);
  if (context === undefined) {
    throw new Error('usePrintNode must be used within a PrintNodeProvider');
  }
  return context;
}