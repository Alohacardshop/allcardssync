import { useState, useEffect } from 'react';

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
      console.error('Error loading custom printer names:', error);
    }
  }, []);

  // Save custom names to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('printer-custom-names', JSON.stringify(customNames));
    } catch (error) {
      console.error('Error saving custom printer names:', error);
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