import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Loader2, CheckCircle, XCircle, Cloud, Printer, Star, Settings2 } from 'lucide-react';
import { usePrintNode } from '@/contexts/PrintNodeContext';
import { printNodeService } from '@/lib/printNodeService';
import { codeDefaultRawCard2x1 } from '@/lib/labels/templateStore';
import { zplFromElements } from '@/lib/labels/zpl';
import type { PrinterPrefs } from '@/lib/labels/types';
import { toast } from 'sonner';

interface EnhancedPrintNodeSelectorProps {
  printerPrefs: PrinterPrefs;
  onPrefsChange: (prefs: PrinterPrefs) => void;
}

export function EnhancedPrintNodeSelector({ printerPrefs, onPrefsChange }: EnhancedPrintNodeSelectorProps) {
  const [localApiKey, setLocalApiKey] = useState('');
  const [defaultPrinterId, setDefaultPrinterId] = useState<string>('');
  const [isDefaultPrinter, setIsDefaultPrinter] = useState(false);
  
  const {
    isConnected,
    isLoading,
    printers,
    selectedPrinterId,
    apiKey,
    testConnection,
    saveApiKey,
    setSelectedPrinterId,
    refreshPrinters
  } = usePrintNode();

  // Load saved default printer on mount
  useEffect(() => {
    const savedDefault = localStorage.getItem('printnode-default-printer');
    if (savedDefault) {
      setDefaultPrinterId(savedDefault);
      if (printerPrefs.printNodeId?.toString() === savedDefault) {
        setIsDefaultPrinter(true);
      }
    }
  }, [printerPrefs.printNodeId]);

  const handleSaveApiKey = async () => {
    const keyToSave = localApiKey.trim() || apiKey.trim();
    if (!keyToSave) return;
    
    try {
      await saveApiKey(keyToSave);
      setLocalApiKey('');
    } catch (error) {
      toast.error('Failed to save API key');
    }
  };

  const handlePrinterChange = (printerId: string) => {
    setSelectedPrinterId(printerId);
    onPrefsChange({
      ...printerPrefs,
      usePrintNode: true,
      printNodeId: parseInt(printerId)
    });

    // Check if this is the default printer
    const savedDefault = localStorage.getItem('printnode-default-printer');
    setIsDefaultPrinter(savedDefault === printerId);
  };

  const handleSetAsDefault = () => {
    if (selectedPrinterId) {
      localStorage.setItem('printnode-default-printer', selectedPrinterId);
      setDefaultPrinterId(selectedPrinterId);
      setIsDefaultPrinter(true);
      toast.success('Printer set as default');
    }
  };

  const handleRemoveDefault = () => {
    localStorage.removeItem('printnode-default-printer');
    setDefaultPrinterId('');
    setIsDefaultPrinter(false);
    toast.success('Default printer removed');
  };

  const handleTestPrint = async () => {
    if (!selectedPrinterId) {
      toast.error('Please select a printer first');
      return;
    }

    try {
      const tpl = codeDefaultRawCard2x1();
      const testZPL = zplFromElements(tpl.layout!, {
        speed: printerPrefs.speed || 4,
        darkness: printerPrefs.darkness || 10,
        media: printerPrefs.media || 'gap',
        copies: printerPrefs.copies || 1,
        leftShift: printerPrefs.leftShift || 0
      });
      
      const result = await printNodeService.printZPL(testZPL, parseInt(selectedPrinterId), printerPrefs.copies || 1);
      
      if (result.success) {
        toast.success('Test print sent successfully!', {
          description: `Job ID: ${result.jobId}`
        });
      } else {
        toast.error('Test print failed');
      }
    } catch (error) {
      toast.error('Test print failed');
    }
  };

  const selectedPrinter = printers.find(p => p.id.toString() === selectedPrinterId);

  return (
    <div className="space-y-6">
      {/* PrintNode Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            PrintNode Integration
          </CardTitle>
          <CardDescription>
            Configure cloud-based printing for reliable, CORS-free printing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isConnected ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            <span className="text-sm">
              {isLoading ? 'Testing connection...' : isConnected ? 'Connected to PrintNode' : 'Not connected'}
            </span>
            {isConnected && (
              <Badge variant="secondary" className="ml-auto">
                {printers.length} printer(s)
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
                placeholder={apiKey ? "Enter new API key to replace current" : "Enter your PrintNode API key"}
                value={localApiKey}
                onChange={(e) => setLocalApiKey(e.target.value)}
              />
              <Button onClick={handleSaveApiKey} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your API key from{' '}
              <a
                href="https://app.printnode.com/account/api"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary"
              >
                PrintNode Dashboard
              </a>
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={testConnection} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test Connection'}
            </Button>
            {isConnected && (
              <Button variant="outline" onClick={refreshPrinters}>
                Refresh Printers
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Enhanced Printer Selection */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Printer Selection
            </CardTitle>
            <CardDescription>
              Choose your printer and set printing preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {printers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Printer className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No printers available</p>
                <p className="text-sm">Make sure PrintNode client is running and printers are added</p>
              </div>
            ) : (
              <>
                {/* Printer Dropdown */}
                <div className="space-y-2">
                  <Label>Select Printer</Label>
                  <Select value={selectedPrinterId} onValueChange={handlePrinterChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a PrintNode printer" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border border-border shadow-md z-50 max-h-60 overflow-y-auto">
                      {printers.map((printer) => (
                        <SelectItem 
                          key={printer.id} 
                          value={printer.id.toString()}
                          className="cursor-pointer hover:bg-accent focus:bg-accent"
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                              <Printer className="h-4 w-4" />
                              <span>{printer.name}</span>
                              {defaultPrinterId === printer.id.toString() && (
                                <Star className="h-3 w-3 text-yellow-500 fill-current" />
                              )}
                            </div>
                            <Badge
                              variant={printer.status === 'online' ? 'default' : 'secondary'}
                              className="ml-2 text-xs"
                            >
                              {printer.status}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Selected Printer Info */}
                {selectedPrinter && (
                  <div className="p-3 bg-muted rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{selectedPrinter.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Status: {selectedPrinter.status} • ID: {selectedPrinter.id}
                        </p>
                      </div>
                      <Badge variant={selectedPrinter.status === 'online' ? 'default' : 'secondary'}>
                        {selectedPrinter.status}
                      </Badge>
                    </div>
                    
                    {/* Default Printer Actions */}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <Star className={`h-4 w-4 ${isDefaultPrinter ? 'text-yellow-500 fill-current' : 'text-muted-foreground'}`} />
                        <span className="text-sm">
                          {isDefaultPrinter ? 'Default Printer' : 'Set as Default'}
                        </span>
                      </div>
                      {isDefaultPrinter ? (
                        <Button variant="outline" size="sm" onClick={handleRemoveDefault}>
                          Remove Default
                        </Button>
                      ) : (
                        <Button size="sm" onClick={handleSetAsDefault}>
                          Set as Default
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Enable PrintNode Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Use PrintNode</Label>
                    <p className="text-xs text-muted-foreground">Enable cloud printing via PrintNode</p>
                  </div>
                  <Switch
                    checked={printerPrefs.usePrintNode || false}
                    onCheckedChange={(checked) => 
                      onPrefsChange({ ...printerPrefs, usePrintNode: checked })
                    }
                  />
                </div>

                {/* Test Print */}
                <Button 
                  onClick={handleTestPrint} 
                  disabled={!selectedPrinterId || isLoading}
                  className="w-full"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Test Print
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}