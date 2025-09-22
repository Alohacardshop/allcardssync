import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Printer, CheckCircle, AlertCircle, Cloud } from 'lucide-react';
import { toast } from 'sonner';
import { printNodeService, PrintNodePrinter } from '@/lib/printNodeService';

export function DefaultPrinterSelector() {
  const [printers, setPrinters] = useState<PrintNodePrinter[]>([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadPrintNodeSettings();
  }, []);

  const loadPrintNodeSettings = async () => {
    setIsLoading(true);
    try {
      // Test connection to see if PrintNode is configured
      const connected = await printNodeService.testConnection();
      setIsConnected(connected);
      
      if (connected) {
        // Load printers
        const printerList = await printNodeService.getPrinters();
        setPrinters(printerList);
        
        // Load saved default printer
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
      }
    } catch (error) {
      console.error('Failed to load PrintNode settings:', error);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetDefault = (printerId: string) => {
    setSelectedPrinterId(printerId);
    
    // Save as default printer
    const printer = printers.find(p => p.id.toString() === printerId);
    if (printer) {
      const currentPrinter = localStorage.getItem('zebra-printer-config');
      const config = currentPrinter ? JSON.parse(currentPrinter) : {};
      
      const updatedConfig = {
        ...config,
        name: printer.name,
        printNodeId: printer.id,
        usePrintNode: true
      };
      
      localStorage.setItem('zebra-printer-config', JSON.stringify(updatedConfig));
      toast.success(`Set default PrintNode printer: ${printer.name}`);
    }
  };

  const selectedPrinter = printers.find(p => p.id.toString() === selectedPrinterId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="h-5 w-5" />
          Default PrintNode Printer
        </CardTitle>
        <CardDescription>
          Set your default PrintNode printer for all print operations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          {isLoading ? (
            <AlertCircle className="h-4 w-4 animate-pulse text-yellow-500" />
          ) : isConnected ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-500" />
          )}
          <span className="text-sm">
            {isLoading ? 'Loading...' : isConnected ? 'PrintNode Connected' : 'PrintNode Not Connected'}
          </span>
        </div>

        {/* Current Default Printer */}
        {selectedPrinter ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted rounded-md">
              <div className="flex items-center gap-3">
                <Printer className="h-4 w-4" />
                <div>
                  <div className="font-medium text-sm">{selectedPrinter.name}</div>
                  <div className="text-xs text-muted-foreground">
                    PrintNode ID: {selectedPrinter.id}
                  </div>
                </div>
              </div>
              <Badge
                variant={selectedPrinter.status === 'online' ? 'default' : 'secondary'}
                className={selectedPrinter.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}
              >
                {selectedPrinter.status}
              </Badge>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Printer className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              {isConnected ? 'No default printer set' : 'Configure PrintNode first'}
            </p>
          </div>
        )}

        {/* Printer Selection */}
        {isConnected && printers.length > 0 && (
          <div className="space-y-2">
            <Select value={selectedPrinterId} onValueChange={handleSetDefault}>
              <SelectTrigger>
                <SelectValue placeholder="Choose default PrintNode printer" />
              </SelectTrigger>
              <SelectContent>
                {printers.map((printer) => (
                  <SelectItem key={printer.id} value={printer.id.toString()}>
                    <div className="flex items-center justify-between w-full">
                      <span>{printer.name}</span>
                      <Badge
                        variant={printer.status === 'online' ? 'default' : 'secondary'}
                        className="ml-2"
                      >
                        {printer.status}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!isConnected && (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-2">
              Configure PrintNode in the settings above first
            </p>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p><strong>Note:</strong> This printer will be used for all print operations. Configure PrintNode above if not connected.</p>
        </div>
      </CardContent>
    </Card>
  );
}