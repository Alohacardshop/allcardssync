import { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';

interface PrinterNameMapping {
  [printerId: number]: string;
}

export function usePrinterNames() {
  const [customNames, setCustomNames] = useState<PrinterNameMapping>({});

  // Load custom names from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('printer-custom-names');
      if (saved) {
        setCustomNames(JSON.parse(saved));
      }
    } catch (error) {
      logger.error('Failed to load custom printer names', error instanceof Error ? error : new Error(String(error)), {}, 'printer-names');
    }
  }, []);

  // Save custom names to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('printer-custom-names', JSON.stringify(customNames));
    } catch (error) {
      logger.error('Failed to save custom printer names', error instanceof Error ? error : new Error(String(error)), {}, 'printer-names');
    }
  }, [customNames]);

  const getDisplayName = (printerId: number, originalName: string) => {
    return customNames[printerId] || originalName;
  };

  const setCustomName = (printerId: number, customName: string) => {
    setCustomNames(prev => ({
      ...prev,
      [printerId]: customName
    }));
  };

  const resetName = (printerId: number) => {
    setCustomNames(prev => {
      const newNames = { ...prev };
      delete newNames[printerId];
      return newNames;
    });
  };

  return {
    getDisplayName,
    setCustomName,
    resetName,
    hasCustomName: (printerId: number) => Boolean(customNames[printerId])
  };
}