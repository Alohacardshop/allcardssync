import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RefreshCw, Printer, CheckCircle, AlertCircle } from 'lucide-react';
import { useZebraNetwork } from '@/hooks/useZebraNetwork';
import { usePrinterNames } from '@/hooks/usePrinterNames';
import { useUserPrinterPreferences } from '@/hooks/useUserPrinterPreferences';
import { useStore } from '@/contexts/StoreContext';
import { toast } from '@/hooks/use-toast';

interface PrinterSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrint: (printerId: string) => Promise<void>;
  title?: string;
  allowDefaultOnly?: boolean; // Allow setting default without printing
}

export function PrinterSelectionDialog({
  open,
  onOpenChange,
  onPrint,
  title = "Select Printer",
  allowDefaultOnly = false
}: PrinterSelectionDialogProps) {
  const { 
    printers, 
    selectedPrinter, 
    isConnected, 
    isLoading, 
    refreshPrinters,
    setSelectedPrinterId: setDefaultPrinter 
  } = useZebraNetwork();
  
  const { getDisplayName } = usePrinterNames();
  const { preference, savePreference } = useUserPrinterPreferences();
  const { availableLocations, selectedLocation } = useStore();
  const [selectedPrinterId, setSelectedPrinterId] = useState<string | null>(null);
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [printing, setPrinting] = useState(false);
  
  const currentLocationName = availableLocations.find(l => l.gid === selectedLocation)?.name;

  // Initialize with user preference or default printer
  useEffect(() => {
    if (open) {
      // Prioritize user's location-specific preference
      if (preference?.printer_id) {
        setSelectedPrinterId(preference.printer_id);
      } else if (selectedPrinter?.id) {
        setSelectedPrinterId(selectedPrinter.id);
      }
    }
  }, [open, selectedPrinter?.id, preference]);

  // Refresh printers when dialog opens
  useEffect(() => {
    if (open && printers.length === 0) {
      refreshPrinters();
    }
  }, [open, printers.length, refreshPrinters]);

  const handleSetDefaultOnly = async () => {
    if (!selectedPrinterId) {
      toast({
        title: "No printer selected",
        description: "Please select a printer first.",
        variant: "destructive"
      });
      return;
    }

    try {
      const selectedZebraPrinter = printers.find(p => p.id === selectedPrinterId);
      if (selectedZebraPrinter) {
        // Save as user's location-specific default
        await savePreference({
          printer_type: 'printnode',
          printer_id: selectedZebraPrinter.id,
          printer_name: selectedZebraPrinter.name,
        });
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Error setting default printer:', error);
      toast({
        title: "Failed to set default",
        description: error instanceof Error ? error.message : "Failed to set default printer",
        variant: "destructive"
      });
    }
  };

  const handlePrint = async () => {
    if (!selectedPrinterId) {
      toast({
        title: "No printer selected",
        description: "Please select a printer before printing.",
        variant: "destructive"
      });
      return;
    }

    setPrinting(true);
    try {
      // Save as user's location-specific default if requested
      if (setAsDefault) {
        const selectedZebraPrinter = printers.find(p => p.id === selectedPrinterId);
        if (selectedZebraPrinter) {
          await savePreference({
            printer_type: 'printnode',
            printer_id: selectedZebraPrinter.id,
            printer_name: selectedZebraPrinter.name,
          });
        }
      }
      
      await onPrint(selectedPrinterId);
      onOpenChange(false);
      
      toast({
        title: "Print job sent",
        description: "Your print job has been sent to the printer.",
      });
    } catch (error) {
      console.error('Print error:', error);
      toast({
        title: "Print failed",
        description: error instanceof Error ? error.message : "Failed to send print job",
        variant: "destructive"
      });
    } finally {
      setPrinting(false);
    }
  };

  const handleRefresh = () => {
    refreshPrinters();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            {title}
          </DialogTitle>
          {currentLocationName && (
            <p className="text-sm text-muted-foreground mt-1">
              Printing to: {currentLocationName}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {!isConnected && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm text-destructive">
                Zebra network not connected. Check your connection.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Available Printers</h4>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {printers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {isLoading ? "Loading printers..." : "No printers available"}
              </div>
            ) : (
              printers.map((printer) => (
                <div
                  key={printer.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedPrinterId === printer.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedPrinterId(printer.id)}
                >
                  <div className={`w-4 h-4 rounded-full border-2 ${
                    selectedPrinterId === printer.id 
                      ? 'border-primary bg-primary' 
                      : 'border-muted-foreground'
                  }`}>
                    {selectedPrinterId === printer.id && (
                      <div className="w-full h-full rounded-full bg-primary-foreground scale-50" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {printer.name}
                      </span>
                      {preference?.printer_id === printer.id && (
                        <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                          Your Default
                        </span>
                      )}
                      {selectedPrinter?.id === printer.id && preference?.printer_id !== printer.id && (
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                          System Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <div className={`w-2 h-2 rounded-full ${
                        printer.isConnected ? 'bg-green-500' : 'bg-gray-400'
                      }`} />
                      {printer.isConnected ? 'Online' : 'Offline'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {selectedPrinterId && (
            <div className="space-y-3">
              {selectedPrinter?.id !== selectedPrinterId && !allowDefaultOnly && (
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="set-default"
                    checked={setAsDefault}
                    onCheckedChange={(checked) => setSetAsDefault(checked as boolean)}
                  />
                  <label 
                    htmlFor="set-default" 
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Set as default for {currentLocationName || 'this location'}
                  </label>
                </div>
              )}
              
              {allowDefaultOnly && selectedPrinter?.id !== selectedPrinterId && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Click "Set as Default" to save this printer as your default choice for future prints.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          
          {allowDefaultOnly && selectedPrinterId && selectedPrinter?.id !== selectedPrinterId && (
            <Button 
              onClick={handleSetDefaultOnly}
              disabled={!selectedPrinterId}
              variant="default"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Set as Default
            </Button>
          )}
          
          {!allowDefaultOnly && (
            <Button 
              onClick={handlePrint}
              disabled={!selectedPrinterId || printing || !isConnected}
              className="min-w-[100px]"
            >
              {printing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Printing...
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}