import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, Cloud } from 'lucide-react';
import { toast } from 'sonner';
import { printNodeService, PrintNodePrinter } from '@/lib/printNodeService';
import { supabase } from '@/integrations/supabase/client';

export function PrintNodeSettings() {
  const [apiKey, setApiKey] = useState('');
  const [printers, setPrinters] = useState<PrintNodePrinter[]>([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    setIsTesting(true);
    try {
      const connected = await printNodeService.testConnection();
      setIsConnected(connected);
      if (connected) {
        await loadPrinters();
      }
    } catch (error) {
      setIsConnected(false);
    } finally {
      setIsTesting(false);
    }
  };

  const saveApiKey = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('set-system-setting', {
        body: { 
          key: 'PRINTNODE_API_KEY',
          value: apiKey.trim()
        }
      });

      if (error) throw error;

      toast.success('PrintNode API key saved');
      await testConnection();
    } catch (error) {
      console.error('Failed to save API key:', error);
      toast.error('Failed to save API key');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPrinters = async () => {
    try {
      const printerList = await printNodeService.getPrinters();
      setPrinters(printerList);
    } catch (error) {
      console.error('Failed to load printers:', error);
      toast.error('Failed to load printers');
    }
  };

  const updatePrinterSettings = (printerId: string) => {
    setSelectedPrinterId(printerId);
    
    // Save to current printer config
    const printer = printers.find(p => p.id.toString() === printerId);
    if (printer) {
      const currentPrinter = localStorage.getItem('zebraPrinterConfig');
      const config = currentPrinter ? JSON.parse(currentPrinter) : {};
      
      const updatedConfig = {
        ...config,
        name: printer.name,
        printNodeId: printer.id,
        usePrintNode: true
      };
      
      localStorage.setItem('zebraPrinterConfig', JSON.stringify(updatedConfig));
      toast.success(`Selected PrintNode printer: ${printer.name}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="h-5 w-5" />
          PrintNode Integration
        </CardTitle>
        <CardDescription>
          Configure cloud-based printing with PrintNode for reliable, CORS-free printing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          {isTesting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isConnected ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          <span className="text-sm">
            {isTesting ? 'Testing connection...' : isConnected ? 'Connected to PrintNode' : 'Not connected'}
          </span>
          {isConnected && (
            <Badge variant="secondary" className="ml-auto">
              {printers.length} printer(s) available
            </Badge>
          )}
        </div>

        {/* API Key Configuration */}
        <div className="space-y-2">
          <Label htmlFor="printnode-api-key">PrintNode API Key</Label>
          <div className="flex gap-2">
            <Input
              id="printnode-api-key"
              type="password"
              placeholder="Enter your PrintNode API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <Button onClick={saveApiKey} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Get your API key from{' '}
            <a
              href="https://app.printnode.com/account/api"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              PrintNode Dashboard
            </a>
          </p>
        </div>

        {/* Printer Selection */}
        {isConnected && printers.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="printnode-printer">Select Printer</Label>
            <Select value={selectedPrinterId} onValueChange={updatePrinterSettings}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a PrintNode printer" />
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

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={testConnection} disabled={isTesting}>
            {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test Connection'}
          </Button>
          {isConnected && (
            <Button variant="outline" onClick={loadPrinters}>
              Refresh Printers
            </Button>
          )}
        </div>

        {/* Help Text */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• PrintNode eliminates CORS issues and provides reliable cloud printing</p>
          <p>• Install PrintNode client on your computer and add your printer</p>
          <p>• Fallback to direct printing if PrintNode is unavailable</p>
        </div>
      </CardContent>
    </Card>
  );
}