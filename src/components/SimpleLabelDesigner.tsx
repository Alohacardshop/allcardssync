/**
 * Simple Label Designer
 * Direct, immediate label design and printing
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Printer, Eye } from 'lucide-react';
import { useSimplePrinting } from '@/hooks/useSimplePrinting';
import { ZPL_TEMPLATES, type LabelData, type ZPLOptions, type TemplateType } from '@/lib/simpleZPLTemplates';
import { SimplePrinterPanel } from './SimplePrinterPanel';
import { PrintNodeSettings } from './PrintNodeSettings';

export function SimpleLabelDesigner() {
  const { print, isLoading, currentPrinter } = useSimplePrinting();
  
  // Template and data state
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('priceTag');
  const [labelData, setLabelData] = useState<LabelData>({
    title: 'Pokemon Card',
    price: '19.99',
    sku: 'PKM-001',
    condition: 'Near Mint',
    barcode: '123456789012',
    qrCode: 'https://example.com/item/123',
    location: 'A1',
    description: 'Sample product'
  });
  
  // Print options
  const [printOptions, setPrintOptions] = useState<ZPLOptions>({
    dpi: 203,
    speed: 4,
    darkness: 10,
    copies: 1,
    cutAfter: true
  });

  // Generate current ZPL
  const generateCurrentZPL = (): string => {
    const generator = ZPL_TEMPLATES[selectedTemplate];
    return generator(labelData, printOptions);
  };

  // Handle print
  const handlePrint = async () => {
    const zpl = generateCurrentZPL();
    await print(zpl, printOptions.copies || 1);
  };

  // Update label data helper
  const updateLabelData = (field: keyof LabelData, value: string) => {
    setLabelData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Label Designer</h1>
        <Badge variant="secondary">Simple & Direct</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Template Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Template & Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Template Type</Label>
              <Select value={selectedTemplate} onValueChange={(value: TemplateType) => setSelectedTemplate(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="priceTag">Price Tag</SelectItem>
                  <SelectItem value="barcode">Barcode Label</SelectItem>
                  <SelectItem value="qrShelf">QR Shelf Label</SelectItem>
                  <SelectItem value="test">Test Label</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Dynamic form based on template */}
            {selectedTemplate === 'priceTag' && (
              <div className="space-y-3">
                <div>
                  <Label>Product Title</Label>
                  <Input 
                    value={labelData.title || ''} 
                    onChange={(e) => updateLabelData('title', e.target.value)}
                    placeholder="Pokemon Card"
                  />
                </div>
                <div>
                  <Label>Price</Label>
                  <Input 
                    value={labelData.price || ''} 
                    onChange={(e) => updateLabelData('price', e.target.value)}
                    placeholder="19.99"
                  />
                </div>
                <div>
                  <Label>SKU</Label>
                  <Input 
                    value={labelData.sku || ''} 
                    onChange={(e) => updateLabelData('sku', e.target.value)}
                    placeholder="PKM-001"
                  />
                </div>
                <div>
                  <Label>Condition</Label>
                  <Input 
                    value={labelData.condition || ''} 
                    onChange={(e) => updateLabelData('condition', e.target.value)}
                    placeholder="Near Mint"
                  />
                </div>
              </div>
            )}

            {selectedTemplate === 'barcode' && (
              <div className="space-y-3">
                <div>
                  <Label>Title</Label>
                  <Input 
                    value={labelData.title || ''} 
                    onChange={(e) => updateLabelData('title', e.target.value)}
                    placeholder="Product Name"
                  />
                </div>
                <div>
                  <Label>Barcode Data</Label>
                  <Input 
                    value={labelData.barcode || ''} 
                    onChange={(e) => updateLabelData('barcode', e.target.value)}
                    placeholder="123456789012"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input 
                    value={labelData.description || ''} 
                    onChange={(e) => updateLabelData('description', e.target.value)}
                    placeholder="Product description"
                  />
                </div>
                <div>
                  <Label>SKU</Label>
                  <Input 
                    value={labelData.sku || ''} 
                    onChange={(e) => updateLabelData('sku', e.target.value)}
                    placeholder="SKU-001"
                  />
                </div>
              </div>
            )}

            {selectedTemplate === 'qrShelf' && (
              <div className="space-y-3">
                <div>
                  <Label>Title</Label>
                  <Input 
                    value={labelData.title || ''} 
                    onChange={(e) => updateLabelData('title', e.target.value)}
                    placeholder="Shelf A1"
                  />
                </div>
                <div>
                  <Label>QR Code Data</Label>
                  <Input 
                    value={labelData.qrCode || ''} 
                    onChange={(e) => updateLabelData('qrCode', e.target.value)}
                    placeholder="https://example.com/item/123"
                  />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input 
                    value={labelData.location || ''} 
                    onChange={(e) => updateLabelData('location', e.target.value)}
                    placeholder="Warehouse"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input 
                    value={labelData.description || ''} 
                    onChange={(e) => updateLabelData('description', e.target.value)}
                    placeholder="Electronics"
                  />
                </div>
              </div>
            )}

            {selectedTemplate === 'test' && (
              <div className="text-sm text-muted-foreground">
                Test label includes current timestamp and sample barcode.
                No additional data required.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Print Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Print Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>DPI</Label>
                <Select 
                  value={printOptions.dpi?.toString() || '203'} 
                  onValueChange={(value) => setPrintOptions(prev => ({ ...prev, dpi: Number(value) as 203 | 300 }))}
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
                  value={printOptions.speed || 4} 
                  onChange={(e) => setPrintOptions(prev => ({ ...prev, speed: Number(e.target.value) }))} 
                />
              </div>
            </div>

            <div>
              <Label>Darkness: {printOptions.darkness || 10}</Label>
              <input
                type="range"
                min="0"
                max="30"
                value={printOptions.darkness || 10}
                onChange={(e) => setPrintOptions(prev => ({ ...prev, darkness: Number(e.target.value) }))}
                className="w-full"
              />
            </div>

            <div>
              <Label>Copies</Label>
              <Input 
                type="number" 
                min="1" 
                max="99" 
                value={printOptions.copies || 1} 
                onChange={(e) => setPrintOptions(prev => ({ ...prev, copies: Number(e.target.value) }))} 
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch 
                checked={printOptions.cutAfter || false} 
                onCheckedChange={(checked) => setPrintOptions(prev => ({ ...prev, cutAfter: checked }))} 
              />
              <Label>Cut after printing</Label>
            </div>

            <Separator />

            {/* Print Button */}
            <div className="space-y-2">
              <Button 
                onClick={handlePrint} 
                disabled={isLoading}
                className="w-full gap-2"
                size="lg"
              >
                <Printer className="h-4 w-4" />
                {isLoading ? 'Printing...' : `Print ${printOptions.copies || 1} Label(s)`}
              </Button>
              
              <div className="text-xs text-center text-muted-foreground">
                Target: {currentPrinter.name || currentPrinter.ip}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Printer Panel */}
        <div className="space-y-4">
          <SimplePrinterPanel />
          <PrintNodeSettings />
        </div>
      </div>

      {/* ZPL Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            ZPL Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted p-4 rounded-md text-sm overflow-auto max-h-64 font-mono">
            {generateCurrentZPL()}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}