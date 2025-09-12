import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Printer, Settings, TestTube, Zap, Eye, Globe, Activity } from 'lucide-react';
import { useZebraNetwork } from '@/hooks/useZebraNetwork';
import { buildZPLWithCut, getLabelSizeInDots, mmToDots, type ZPLElement, type Dpi } from '@/lib/zpl';
import { priceTag, type PriceTagData } from '@/lib/templates/priceTag';
import { barcodeLabel, type BarcodeData } from '@/lib/templates/barcode';
import { qrShelfLabel, type QRShelfData } from '@/lib/templates/qrShelf';

export function LabelDesigner() {
  // Settings state
  const [labelWidth, setLabelWidth] = useState('50.8');  // 2 inches in mm
  const [labelHeight, setLabelHeight] = useState('25.4'); // 1 inch in mm
  const [dpi, setDpi] = useState<Dpi>(203);
  const [speed, setSpeed] = useState(4);
  const [darkness, setDarkness] = useState(10);
  const [copies, setCopies] = useState(1);
  const [cutAtEnd, setCutAtEnd] = useState(true);
  const [hasCutter, setHasCutter] = useState(false);
  
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

  const { selectedPrinter, printZPL, testConnection } = useZebraNetwork();

  // Generate current ZPL based on selected template
  const generateCurrentZPL = (): string => {
    const baseOptions = {
      dpi,
      speedIps: speed,
      darkness,
      copies,
      cutAtEnd,
      hasCutter
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

  // Print current label
  const handlePrint = async () => {
    if (!selectedPrinter) {
      toast.error('No printer selected');
      return;
    }

    try {
      const zpl = generateCurrentZPL();
      const result = await printZPL(zpl, { title: 'Label Print', copies });
      
      if (result.success) {
        toast.success('Label sent to printer successfully!');
      } else {
        toast.error(result.error || 'Print failed');
      }
    } catch (error) {
      toast.error('Print failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  // Utility functions - simple implementations
  const handleConfigLabel = () => {
    if (selectedPrinter) {
      printZPL('^XA^HH^XZ', { title: 'Config Label' });
    }
  };
  const handleCalibrate = () => {
    if (selectedPrinter) {
      toast.info('Calibration feature coming soon');
    }
  };
  const handlePing = () => {
    if (selectedPrinter) {
      toast.info('Network ping feature coming soon');
    }
  };
  const handleOpenWebUI = () => {
    if (selectedPrinter) {
      window.open(`http://${selectedPrinter.ip}`, '_blank');
    }
  };

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
                <Select value={dpi.toString()} onValueChange={(value) => setDpi(Number(value) as Dpi)}>
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
                  value={speed} 
                  onChange={(e) => setSpeed(Number(e.target.value))} 
                />
              </div>
            </div>

            <div>
              <Label>Darkness (0-30): {darkness}</Label>
              <input
                type="range"
                min="0"
                max="30"
                value={darkness}
                onChange={(e) => setDarkness(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch checked={cutAtEnd} onCheckedChange={setCutAtEnd} />
              <Label>Cut at end of job</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch checked={hasCutter} onCheckedChange={setHasCutter} />
              <Label>Printer has cutter</Label>
            </div>

            <div>
              <Label>Copies</Label>
              <Input 
                type="number" 
                min="1" 
                max="99" 
                value={copies} 
                onChange={(e) => setCopies(Number(e.target.value))} 
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-2">
            <Button onClick={handlePrint} disabled={!selectedPrinter} className="flex items-center gap-2">
              <Printer className="h-4 w-4" />
              Print Label
            </Button>
            
            <Separator orientation="vertical" className="h-8" />
            
            <Button variant="outline" onClick={handleConfigLabel} disabled={!selectedPrinter}>
              <Eye className="h-4 w-4 mr-2" />
              Config Label
            </Button>
            
            <Button variant="outline" onClick={handleCalibrate} disabled={!selectedPrinter}>
              <Zap className="h-4 w-4 mr-2" />
              Calibrate
            </Button>
            
            <Button variant="outline" onClick={handlePing} disabled={!selectedPrinter}>
              <Activity className="h-4 w-4 mr-2" />
              Network Ping
            </Button>
            
            <Button variant="outline" onClick={handleOpenWebUI} disabled={!selectedPrinter}>
              <Globe className="h-4 w-4 mr-2" />
              Open WebUI
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card>
        <CardHeader>
          <CardTitle>ZPL Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted p-4 rounded-md text-sm overflow-auto max-h-64">
            {generateCurrentZPL()}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}