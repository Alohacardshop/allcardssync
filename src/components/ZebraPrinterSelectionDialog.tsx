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
import { toast } from 'sonner';

interface ZebraPrinterSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrint: (printer: any) => Promise<void>;
  title?: string;
  allowDefaultOnly?: boolean;
}

export function ZebraPrinterSelectionDialog({
  open,
  onOpenChange,
  onPrint,
  title = "Select Zebra Printer",
  allowDefaultOnly = false
}: ZebraPrinterSelectionDialogProps) {
  const { 
    printers, 
    selectedPrinter, 
    isConnected, 
    isLoading, 
    refreshPrinters,
    setSelectedPrinterId 
  } = useZebraNetwork();
  
  const [selectedPrinterId, setLocalSelectedPrinterId] = useState<string | null>(null);
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [printing, setPrinting] = useState(false);

  // Initialize with current default printer
  useEffect(() => {
    if (open && selectedPrinter?.id) {
      setLocalSelectedPrinterId(selectedPrinter.id);
    }
  }, [open, selectedPrinter?.id]);

  // Refresh printers when dialog opens
  useEffect(() => {
    if (open && printers.length === 0) {
      refreshPrinters();
    }
  }, [open, printers.length, refreshPrinters]);

  const handleSetDefaultOnly = async () => {
    if (!selectedPrinterId) {
      toast.error("No printer selected");
      return;
    }

    try {
      const printer = printers.find(p => p.id === selectedPrinterId);
      if (printer) {
        setSelectedPrinterId(printer);
        onOpenChange(false);
        toast.success("Default printer updated");
      }
    } catch (error) {
      console.error('Error setting default printer:', error);
      toast.error(error instanceof Error ? error.message : "Failed to set default printer");
    }
  };

  const handlePrint = async () => {
    if (!selectedPrinterId) {
      toast.error("Please select a printer before printing");
      return;
    }

    setPrinting(true);
    try {
      const printer = printers.find(p => p.id === selectedPrinterId);
      if (!printer) {
        throw new Error("Selected printer not found");
      }

      // Set as default if requested
      if (setAsDefault) {
        setSelectedPrinterId(printer);
      }

      await onPrint(printer);
      
      onOpenChange(false);
      toast.success("Print job sent successfully");
    } catch (error) {
      console.error('Print error:', error);
      toast.error(error instanceof Error ? error.message : "Print job failed");
    } finally {
      setPrinting(false);
    }
  };

  const handleRefresh = () => {
    refreshPrinters(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-4 w-4" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Connection Status */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-md">
            <span className="text-sm font-medium">Network Status:</span>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-600">Connected</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  <span className="text-sm text-orange-600">No Printers</span>
                </>
              )}
            </div>
          </div>

          {/* Printer List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Available Printers:</label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading}
                className="gap-2"
              >
                <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
                {isLoading ? "Scanning..." : "Refresh"}
              </Button>
            </div>

            {printers.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {printers.map((printer) => (
                  <div key={printer.id} className="flex items-center gap-3 p-3 border rounded-md">
                    <input
                      type="radio"
                      id={`dialog-printer-${printer.id}`}
                      name="dialogSelectedPrinter"
                      checked={selectedPrinterId === printer.id}
                      onChange={() => setLocalSelectedPrinterId(printer.id)}
                      className="h-4 w-4"
                    />
                    
                    <div className="flex-1 min-w-0">
                      <label 
                        htmlFor={`dialog-printer-${printer.id}`}
                        className="font-medium text-sm cursor-pointer block"
                      >
                        {printer.name}
                      </label>
                      <div className="text-xs text-muted-foreground">
                        {printer.ip}:{printer.port} • {printer.isConnected ? "Online" : "Offline"}
                      </div>
                    </div>

                    <div className={`w-2 h-2 rounded-full ${
                      printer.isConnected ? "bg-green-500" : "bg-gray-400"
                    }`} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                {isLoading ? "Scanning for printers..." : "No printers found"}
              </div>
            )}
          </div>

          {/* Set as Default Option */}
          {!allowDefaultOnly && (
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
                Set as default printer
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={printing}
          >
            Cancel
          </Button>
          
          {allowDefaultOnly ? (
            <Button 
              onClick={handleSetDefaultOnly}
              disabled={!selectedPrinterId || printing}
            >
              Set as Default
            </Button>
          ) : (
            <Button 
              onClick={handlePrint}
              disabled={!selectedPrinterId || printing}
            >
              {printing ? "Printing..." : "Print"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}