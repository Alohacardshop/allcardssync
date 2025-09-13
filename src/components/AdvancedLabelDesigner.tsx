import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Download, Printer, Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { LabelPreviewCanvas } from '@/components/LabelPreviewCanvas';
import { PrintNodeSettings } from '@/components/PrintNodeSettings';
import { useRawTemplates } from '@/hooks/useRawTemplates';
import { useSimplePrinting } from '@/hooks/useSimplePrinting';
import { AVAILABLE_TEMPLATES, generateLabelTSPL } from '@/lib/labelTemplates';
import { LabelFieldConfig, LabelData } from '@/lib/labelRenderer';

interface AdvancedLabelDesignerProps {
  className?: string;
}

export function AdvancedLabelDesigner({ className = "" }: AdvancedLabelDesignerProps) {
  const canvasRef = useRef<any>(null);
  const { print, isLoading: isPrinting, testConnection } = useSimplePrinting();
  
  // Template management
  const {
    templates,
    defaultTemplate,
    saveTemplate,
    setAsDefault,
    loading: templatesLoading
  } = useRawTemplates();

  // Field configuration state
  const [fieldConfig, setFieldConfig] = useState<LabelFieldConfig>({
    includeTitle: true,
    includeSku: true,
    includePrice: true,
    includeLot: false,
    includeCondition: true,
    barcodeMode: 'barcode'
  });

  // Label data state
  const [labelData, setLabelData] = useState<LabelData>({
    title: "POKEMON GENGAR VMAX #020",
    sku: "120979260",
    price: "$15.99",
    lot: "LOT-000001", 
    condition: "Near Mint",
    barcode: "120979260"
  });

  // Template and settings
  const [selectedTemplateId, setSelectedTemplateId] = useState('graded-card');
  const [templateName, setTemplateName] = useState('');
  const [showGuides, setShowGuides] = useState(false);
  const [copies, setCopies] = useState(1);

  // TSPL settings
  const [tsplSettings, setTsplSettings] = useState({
    density: 10,
    speed: 4,
    gapInches: 0
  });

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedFieldConfig = localStorage.getItem('labelDesigner_fieldConfig');
    const savedLabelData = localStorage.getItem('labelDesigner_labelData');
    const savedShowGuides = localStorage.getItem('labelDesigner_showGuides');
    
    if (savedFieldConfig) {
      try {
        setFieldConfig(JSON.parse(savedFieldConfig));
      } catch (error) {
        console.error('Failed to parse saved field config:', error);
      }
    }
    
    if (savedLabelData) {
      try {
        setLabelData(JSON.parse(savedLabelData));
      } catch (error) {
        console.error('Failed to parse saved label data:', error);
      }
    }
    
    setShowGuides(savedShowGuides === 'true');
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('labelDesigner_fieldConfig', JSON.stringify(fieldConfig));
  }, [fieldConfig]);

  useEffect(() => {
    localStorage.setItem('labelDesigner_labelData', JSON.stringify(labelData));
  }, [labelData]);

  useEffect(() => {
    localStorage.setItem('labelDesigner_showGuides', showGuides.toString());
  }, [showGuides]);

  // Load default template
  useEffect(() => {
    if (defaultTemplate && !templatesLoading) {
      setFieldConfig(defaultTemplate.canvas.fieldConfig);
      setLabelData(defaultTemplate.canvas.labelData);
      setTsplSettings(defaultTemplate.canvas.tsplSettings);
    }
  }, [defaultTemplate, templatesLoading]);

  const handleFieldConfigChange = (field: keyof LabelFieldConfig, value: boolean | string) => {
    setFieldConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleLabelDataChange = (field: keyof LabelData, value: string) => {
    setLabelData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error('Please enter a template name');
      return;
    }

    const result = await saveTemplate(
      templateName,
      fieldConfig,
      labelData,
      tsplSettings
    );

    if (result) {
      toast.success('Template saved successfully');
      setTemplateName('');
    }
  };

  const handleLoadTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setFieldConfig(template.canvas.fieldConfig);
      setLabelData(template.canvas.labelData);
      setTsplSettings(template.canvas.tsplSettings);
      toast.success(`Loaded template: ${template.name}`);
    }
  };

  const handlePrint = async () => {
    try {
      const zplCode = generateLabelTSPL(selectedTemplateId, labelData, tsplSettings);
      await print(zplCode, copies);
    } catch (error) {
      console.error('Print failed:', error);
      toast.error('Failed to print label');
    }
  };

  const handleExportPNG = async () => {
    if (canvasRef.current?.exportToPNG) {
      try {
        const blob = await canvasRef.current.exportToPNG(203);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'label.png';
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Label exported as PNG');
      } catch (error) {
        console.error('Export failed:', error);
        toast.error('Failed to export PNG');
      }
    }
  };

  const handleExportPDF = async () => {
    if (canvasRef.current?.exportToPDF) {
      try {
        const pdfDataUri = await canvasRef.current.exportToPDF();
        const a = document.createElement('a');
        a.href = pdfDataUri;
        a.download = 'label.pdf';
        a.click();
        toast.success('Label exported as PDF');
      } catch (error) {
        console.error('Export failed:', error);
        toast.error('Failed to export PDF');
      }
    }
  };

  const resetToDefaults = () => {
    setFieldConfig({
      includeTitle: true,
      includeSku: true,
      includePrice: true,
      includeLot: false,
      includeCondition: true,
      barcodeMode: 'barcode'
    });
    setLabelData({
      title: "POKEMON GENGAR VMAX #020",
      sku: "120979260",
      price: "$15.99",
      lot: "LOT-000001",
      condition: "Near Mint",
      barcode: "120979260"
    });
    setTsplSettings({
      density: 10,
      speed: 4,
      gapInches: 0
    });
    toast.success('Reset to defaults');
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Label Designer</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="fields" className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="fields">Fields</TabsTrigger>
                  <TabsTrigger value="data">Data</TabsTrigger>
                  <TabsTrigger value="template">Template</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                  <TabsTrigger value="printer">Printer</TabsTrigger>
                </TabsList>

                {/* Field Configuration */}
                <TabsContent value="fields" className="space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="title-toggle">Include Title</Label>
                      <Switch
                        id="title-toggle"
                        checked={fieldConfig.includeTitle}
                        onCheckedChange={(checked) => handleFieldConfigChange('includeTitle', checked)}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <Label htmlFor="sku-toggle">Include SKU</Label>
                      <Switch
                        id="sku-toggle"
                        checked={fieldConfig.includeSku}
                        onCheckedChange={(checked) => handleFieldConfigChange('includeSku', checked)}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <Label htmlFor="price-toggle">Include Price</Label>
                      <Switch
                        id="price-toggle"
                        checked={fieldConfig.includePrice}
                        onCheckedChange={(checked) => handleFieldConfigChange('includePrice', checked)}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <Label htmlFor="condition-toggle">Include Condition</Label>
                      <Switch
                        id="condition-toggle"
                        checked={fieldConfig.includeCondition}
                        onCheckedChange={(checked) => handleFieldConfigChange('includeCondition', checked)}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="barcode-mode">Barcode Mode</Label>
                      <Select
                        value={fieldConfig.barcodeMode}
                        onValueChange={(value) => handleFieldConfigChange('barcodeMode', value as 'qr' | 'barcode' | 'none')}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="barcode">Barcode</SelectItem>
                          <SelectItem value="qr">QR Code</SelectItem>
                          <SelectItem value="none">None</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="guides-toggle">Show Guides</Label>
                      <Switch
                        id="guides-toggle"
                        checked={showGuides}
                        onCheckedChange={setShowGuides}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* Data Input */}
                <TabsContent value="data" className="space-y-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title-input">Title</Label>
                      <Input
                        id="title-input"
                        value={labelData.title}
                        onChange={(e) => handleLabelDataChange('title', e.target.value)}
                        placeholder="Enter card title"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="sku-input">SKU</Label>
                      <Input
                        id="sku-input"
                        value={labelData.sku}
                        onChange={(e) => handleLabelDataChange('sku', e.target.value)}
                        placeholder="Enter SKU"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="price-input">Price</Label>
                      <Input
                        id="price-input"
                        value={labelData.price}
                        onChange={(e) => handleLabelDataChange('price', e.target.value)}
                        placeholder="Enter price"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="condition-input">Condition</Label>
                      <Input
                        id="condition-input"
                        value={labelData.condition}
                        onChange={(e) => handleLabelDataChange('condition', e.target.value)}
                        placeholder="Enter condition"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="barcode-input">Barcode Data</Label>
                      <Input
                        id="barcode-input"
                        value={labelData.barcode}
                        onChange={(e) => handleLabelDataChange('barcode', e.target.value)}
                        placeholder="Enter barcode data"
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* Template Management */}
                <TabsContent value="template" className="space-y-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="template-select">Load Template</Label>
                      <Select onValueChange={handleLoadTemplate}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a template" />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="base-template">Base Template Style</Label>
                      <Select
                        value={selectedTemplateId}
                        onValueChange={setSelectedTemplateId}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AVAILABLE_TEMPLATES.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="template-name">Save as New Template</Label>
                      <div className="flex gap-2">
                        <Input
                          id="template-name"
                          value={templateName}
                          onChange={(e) => setTemplateName(e.target.value)}
                          placeholder="Template name"
                        />
                        <Button onClick={handleSaveTemplate} size="sm">
                          <Save className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Print Settings */}
                <TabsContent value="settings" className="space-y-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="copies">Copies</Label>
                      <Input
                        id="copies"
                        type="number"
                        min="1"
                        max="100"
                        value={copies}
                        onChange={(e) => setCopies(parseInt(e.target.value) || 1)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="density">Print Density</Label>
                      <Input
                        id="density"
                        type="number"
                        min="1"
                        max="15"
                        value={tsplSettings.density}
                        onChange={(e) => setTsplSettings(prev => ({
                          ...prev,
                          density: parseInt(e.target.value) || 10
                        }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="speed">Print Speed</Label>
                      <Input
                        id="speed"
                        type="number"
                        min="1"
                        max="10"
                        value={tsplSettings.speed}
                        onChange={(e) => setTsplSettings(prev => ({
                          ...prev,
                          speed: parseInt(e.target.value) || 4
                        }))}
                      />
                    </div>

                    <Button onClick={resetToDefaults} variant="outline" className="w-full">
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset to Defaults
                    </Button>
                  </div>
              </TabsContent>

              <TabsContent value="printer" className="space-y-4">
                <PrintNodeSettings />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        </div>

        {/* Preview Panel */}
        <div className="space-y-4">
          <LabelPreviewCanvas
            ref={canvasRef}
            fieldConfig={fieldConfig}
            labelData={labelData}
            showGuides={showGuides}
          />

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handlePrint} disabled={isPrinting} className="w-full">
              <Printer className="w-4 h-4 mr-2" />
              {isPrinting ? 'Printing...' : `Print (${copies})`}
            </Button>
            
            <Button onClick={handleExportPNG} variant="outline" className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Export PNG
            </Button>
          </div>
          
          <Button onClick={handleExportPDF} variant="outline" className="w-full">
            <Download className="w-4 h-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>
    </div>
  );
}