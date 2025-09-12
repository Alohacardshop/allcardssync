import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Printer, Settings, AlertTriangle, Wifi, WifiOff, Target, RefreshCw } from 'lucide-react';
import { useZebraNetwork } from '@/hooks/useZebraNetwork';
import { useLabelSettings } from '@/hooks/useLabelSettings';
import { buildZPLWithCut, getLabelSizeInDots, type Dpi } from '@/lib/zpl';
import { priceTag, type PriceTagData } from '@/lib/templates/priceTag';
import { barcodeLabel, type BarcodeData } from '@/lib/templates/barcode';
import { qrShelfLabel, type QRShelfData } from '@/lib/templates/qrShelf';
import { zebraNetworkService, type PrinterStatus } from '@/lib/zebraNetworkService';
import { ZebraDiagnosticsPanel } from '@/components/ZebraDiagnosticsPanel';
import { ZebraPrinterPanel } from '@/components/ZebraPrinterPanel';

export function LabelDesigner() {
  const { selectedPrinter, printZPL, printerStatus } = useZebraNetwork();
  const { settings, updatePrintSettings, updatePrinterSettings, isLoading: settingsLoading } = useLabelSettings();
  
  // Template selection
  const [selectedTemplate, setSelectedTemplate] = useState<'price' | 'barcode' | 'qr'>('price');
  // Sample data for templates
  const [priceData, setPriceData] = useState<PriceTagData>({
    title: 'Pokemon Card',
    price: '19.99',
    sku: 'PKM-001',
    condition: 'Near Mint'
  });
  
  const [barcodeData, setBarcodeData] = useState<BarcodeData>({
    barcode: '123456789012',
    title: 'Sample Product',
    description: 'Test barcode label'
  });
  
  const [qrData, setQrData] = useState<QRShelfData>({
    qrData: 'https://example.com/item/123',
    title: 'Shelf A1',
    location: 'Warehouse',
    section: 'Electronics'
  });
  const generateCurrentZPL = (): string => {
    const baseOptions = {
      dpi: settings.dpi,
      speedIps: settings.speed,
      darkness: settings.darkness,
      copies: settings.copies,
      cutAtEnd: settings.cutMode !== 'none',
      hasCutter: settings.hasCutter
    };

    switch (selectedTemplate) {
      case 'price':
        return priceTag(priceData, baseOptions);
      case 'barcode':
        return barcodeLabel(barcodeData, baseOptions);
      case 'qr':
        return qrShelfLabel(qrData, baseOptions);
      default:
        return priceTag(priceData, baseOptions);
    }
  };

  // Determine if print is allowed
  const canPrint = selectedPrinter && printerStatus?.ready;
  const getPrintDisabledReason = (): string | null => {
    if (!selectedPrinter) return 'Select a Zebra printer first';
    if (!printerStatus) return 'Checking printer status...';
    if (!printerStatus.ready) {
      const issues = [];
      if (printerStatus.paused) issues.push('printer is paused');
      if (printerStatus.headOpen) issues.push('print head is open'); 
      if (printerStatus.mediaOut) issues.push('media/ribbon is out');
      return issues.length > 0 ? `Cannot print: ${issues.join(', ')}` : 'Printer not ready';
    }
    return null;
  };

  // Print current label
  const handlePrint = async () => {
    if (!selectedPrinter) {
      toast.error('Select a Zebra printer first');
      return;
    }

    if (!printerStatus?.ready) {
      const reason = getPrintDisabledReason();
      toast.error(reason || 'Printer not ready');
      return;
    }

    // Show print start toast with target info
    toast.info(`Sending ${settings.copies} label(s) to ${selectedPrinter.ip}:${selectedPrinter.port}...`);

    try {
      const zpl = generateCurrentZPL();
      const result = await printZPL(zpl, { title: 'Label Designer Print', copies: settings.copies });
      
      if (result.success) {
        toast.success(`Label sent to ${selectedPrinter.ip} successfully!`);
      } else {
        toast.error(result.error || 'Print failed');
        
        // Provide actionable CTAs on error
        setTimeout(() => {
          toast.info('Try these actions:', {
            description: 'Query Status, Open Web UI, or Check Connection',
            duration: 8000,
            action: {
              label: 'Open Web UI',
              onClick: () => window.open(`http://${selectedPrinter.ip}`, '_blank')
            }
          });
        }, 1000);
      }
    } catch (error) {
      toast.error('Print failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  // Connection status helper
  const getConnectionStatus = () => {
    if (!selectedPrinter) return { status: 'no-printer', message: 'No printer selected' };
    if (selectedPrinter.isConnected) return { status: 'connected', message: 'Ready to print' };
    if (selectedPrinter.isConnected === false) return { status: 'offline', message: 'Printer offline' };
    return { status: 'unknown', message: 'Connection status unknown' };
  };

  const connectionStatus = getConnectionStatus();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">ZPL Label Designer</h1>
        <Badge variant="secondary">Zebra ZD410 Compatible</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Template Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Template & Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Template Type</Label>
              <Select value={selectedTemplate} onValueChange={(value: any) => setSelectedTemplate(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="price">Price Tag (2×1")</SelectItem>
                  <SelectItem value="barcode">Barcode Label (2×1")</SelectItem>
                  <SelectItem value="qr">QR Shelf (2.25×1.25")</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedTemplate === 'price' && (
              <div className="space-y-2">
                <Input 
                  placeholder="Product Title" 
                  value={priceData.title}
                  onChange={(e) => setPriceData({...priceData, title: e.target.value})}
                />
                <Input 
                  placeholder="Price" 
                  value={priceData.price}
                  onChange={(e) => setPriceData({...priceData, price: e.target.value})}
                />
                <Input 
                  placeholder="SKU" 
                  value={priceData.sku || ''}
                  onChange={(e) => setPriceData({...priceData, sku: e.target.value})}
                />
              </div>
            )}

            {selectedTemplate === 'barcode' && (
              <div className="space-y-2">
                <Input 
                  placeholder="Barcode Data" 
                  value={barcodeData.barcode}
                  onChange={(e) => setBarcodeData({...barcodeData, barcode: e.target.value})}
                />
                <Input 
                  placeholder="Title" 
                  value={barcodeData.title || ''}
                  onChange={(e) => setBarcodeData({...barcodeData, title: e.target.value})}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Print Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Print Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>DPI</Label>
                <Select 
                  value={settings.dpi.toString()} 
                  onValueChange={(value) => updatePrintSettings({ dpi: Number(value) as Dpi })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="203">203 DPI</SelectItem>
                    <SelectItem value="300">300 DPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Speed (IPS)</Label>
                <Input 
                  type="number" 
                  min="2" 
                  max="6" 
                  value={settings.speed} 
                  onChange={(e) => updatePrintSettings({ speed: Number(e.target.value) })} 
                />
              </div>
            </div>

            <div>
              <Label>Darkness (0-30): {settings.darkness}</Label>
              <input
                type="range"
                min="0"
                max="30"
                value={settings.darkness}
                onChange={(e) => updatePrintSettings({ darkness: Number(e.target.value) })}
                className="w-full"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch 
                checked={settings.cutMode === 'end-of-job'} 
                onCheckedChange={(checked) => updatePrintSettings({ 
                  cutMode: checked ? 'end-of-job' : 'none' 
                })} 
              />
              <Label>Cut at end of job</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch 
                checked={settings.hasCutter} 
                onCheckedChange={(checked) => updatePrinterSettings({ hasCutter: checked })} 
              />
              <Label>Printer has cutter</Label>
            </div>

            <div>
              <Label>Copies</Label>
              <Input 
                type="number" 
                min="1" 
                max="99" 
                value={settings.copies} 
                onChange={(e) => updatePrintSettings({ copies: Number(e.target.value) })} 
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Print Actions */}
      <Card>
        <CardContent className="pt-6">
          {/* Target Printer Info */}
          {selectedPrinter && (
            <div className="flex items-center justify-between mb-4 p-2 bg-muted rounded">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Target:</span>
                <code className="text-xs px-2 py-1 bg-background rounded">{selectedPrinter.ip}:{selectedPrinter.port}</code>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => window.location.reload()} // Simple refresh for now
                className="h-6"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Printer Status */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium">Printer Status:</span>
            <div className="flex items-center gap-2">
              {!selectedPrinter ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <Badge variant="secondary">No printer selected</Badge>
                </>
              ) : !printerStatus ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <Badge variant="secondary">Checking...</Badge>
                </>
              ) : printerStatus.ready ? (
                <>
                  <Wifi className="h-4 w-4 text-green-600" />
                  <Badge variant="default">Ready</Badge>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-red-600" />
                  <Badge variant="destructive">Not Ready</Badge>
                </>
              )}
            </div>
          </div>

          {/* Print Button */}
          <div className="space-y-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={handlePrint} 
                    disabled={!canPrint}
                    className="w-full flex items-center gap-2"
                  >
                    <Printer className="h-4 w-4" />
                    Print Label ({settings.copies} {settings.copies === 1 ? 'copy' : 'copies'})
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {getPrintDisabledReason() || 'Print label to selected printer'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            {!selectedPrinter && (
              <div className="text-sm text-muted-foreground text-center">
                Select a printer in the Zebra Network Printing panel below
              </div>
            )}
            
            {selectedPrinter && !printerStatus?.ready && printerStatus && (
              <div className="text-sm text-yellow-700 text-center space-y-1">
                <div>Printer issues detected:</div>
                <div className="text-xs space-x-2">
                  {printerStatus.paused && <Badge variant="outline" className="text-xs">Paused</Badge>}
                  {printerStatus.headOpen && <Badge variant="outline" className="text-xs">Head Open</Badge>}
                  {printerStatus.mediaOut && <Badge variant="outline" className="text-xs">Media Out</Badge>}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Diagnostics Panel */}
      <div className="lg:col-span-2">
        <ZebraDiagnosticsPanel />
      </div>

      {/* Printer Panel */}
      <div className="lg:col-span-2">
        <ZebraPrinterPanel />
      </div>

      {/* ZPL Preview */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>ZPL Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-auto max-h-64 font-mono">
              {generateCurrentZPL()}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}