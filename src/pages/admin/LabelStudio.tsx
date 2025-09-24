import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { 
  Save, 
  Download, 
  Upload, 
  RefreshCw, 
  Printer, 
  Settings, 
  Eye,
  TestTube,
  FileText,
  Code,
  Trash2
} from "lucide-react";
import { zplPriceBarcodeThirds2x1, type ThirdsLabelData } from "@/lib/templates/priceBarcodeThirds2x1";
import { print } from '@/lib/printService';
import { toast } from "sonner";
import { supabase } from '@/integrations/supabase/client';

interface Template {
  id: string;
  name: string;
  description?: string;
  is_default: boolean;
  zpl_code: string;
  template_type: string;
  created_at: string;
  updated_at: string;
}

interface PrinterPrefs {
  usePrintNode?: boolean;
  printNodeId?: number;
  speed?: number;
  darkness?: number;
  copies?: number;
  media?: 'gap' | 'blackmark' | 'continuous';
}

interface TestVars {
  CARDNAME: string;
  SETNAME: string;
  CARDNUMBER: string;
  CONDITION: string;
  PRICE: string;
  SKU: string;
  BARCODE: string;
}

export default function LabelStudio() {
  const [currentTemplate, setCurrentTemplate] = useState<Template | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [zplCode, setZplCode] = useState('');
  const [availableTemplates, setAvailableTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [generatedZpl, setGeneratedZpl] = useState('');
  
  const [printerPrefs, setPrinterPrefs] = useState<PrinterPrefs>({
    usePrintNode: true,
    speed: 4,
    darkness: 10,
    copies: 1,
    media: 'gap'
  });
  
  const [testVars, setTestVars] = useState<TestVars>({
    CARDNAME: 'Pikachu VMAX',
    SETNAME: 'Vivid Voltage',
    CARDNUMBER: '#047',
    CONDITION: 'NM',
    PRICE: '$24.99',
    SKU: 'PKM-001',
    BARCODE: 'PKM001'
  });

  // Load printer config on mount
  useEffect(() => {
    try {
      const cfg = JSON.parse(localStorage.getItem('zebra-printer-config') || '{}');
      const defaultPrinterId = localStorage.getItem('printnode-default-printer');
      
      const updatedPrefs = { ...cfg };
      if (defaultPrinterId && !updatedPrefs.printNodeId) {
        updatedPrefs.usePrintNode = true;
        updatedPrefs.printNodeId = parseInt(defaultPrinterId);
      }
      
      setPrinterPrefs(prev => ({ ...prev, ...updatedPrefs }));
    } catch (error) {
      console.error('Failed to load printer config:', error);
    }
  }, []);

  // Load available templates on mount
  useEffect(() => {
    loadAvailableTemplates();
  }, []);

  // Generate ZPL when test vars change
  useEffect(() => {
    if (zplCode) {
      let processedZpl = zplCode;
      
      // Replace placeholders with test variables
      processedZpl = processedZpl
        .replace(/{{CARDNAME}}/g, testVars.CARDNAME)
        .replace(/{{SETNAME}}/g, testVars.SETNAME)
        .replace(/{{CARDNUMBER}}/g, testVars.CARDNUMBER)
        .replace(/{{CONDITION}}/g, testVars.CONDITION)
        .replace(/{{PRICE}}/g, testVars.PRICE)
        .replace(/{{SKU}}/g, testVars.SKU)
        .replace(/{{BARCODE}}/g, testVars.BARCODE);
      
      setGeneratedZpl(processedZpl);
    }
  }, [zplCode, testVars]);

  const loadAvailableTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('label_templates_new')
        .select('*')
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      
      const templates: Template[] = (data || []).map(t => ({
        id: t.id,
        name: t.id,
        description: `Template with ${t.required_fields?.length || 0} required fields`,
        is_default: false,
        zpl_code: t.body,
        template_type: 'custom',
        created_at: t.updated_at,
        updated_at: t.updated_at
      }));
      
      setAvailableTemplates(templates);
    } catch (error) {
      console.error('Failed to load templates:', error);
      toast.error('Failed to load available templates');
    }
  };

  const handleLoadTemplate = async (templateId: string) => {
    try {
      const template = availableTemplates.find(t => t.id === templateId);
      if (!template) throw new Error('Template not found');
      
      setCurrentTemplate(template);
      setTemplateName(template.name);
      setTemplateDescription(template.description || '');
      setZplCode(template.zpl_code);
      setSelectedTemplateId(templateId);
      toast.success('Template loaded successfully');
    } catch (error) {
      console.error('Failed to load template:', error);
      toast.error('Failed to load template');
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    
    if (!zplCode.trim()) {
      toast.error('ZPL code cannot be empty');
      return;
    }
    
    try {
      const templateId = templateName.toLowerCase().replace(/\s+/g, '_');
      
      // Extract placeholders from ZPL code
      const placeholderPattern = /{{(\w+)}}/g;
      const matches = [...zplCode.matchAll(placeholderPattern)];
      const requiredFields = [...new Set(matches.map(match => match[1]))];
      
      const { error } = await supabase
        .from('label_templates_new')
        .upsert({
          id: templateId,
          body: zplCode,
          required_fields: requiredFields,
          optional_fields: []
        });
      
      if (error) throw error;
      
      await loadAvailableTemplates();
      toast.success('Template saved successfully');
    } catch (error) {
      console.error('Failed to save template:', error);
      toast.error('Failed to save template');
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    
    try {
      const { error } = await supabase
        .from('label_templates_new')
        .delete()
        .eq('id', templateId);
      
      if (error) throw error;
      
      await loadAvailableTemplates();
      if (currentTemplate?.id === templateId) {
        setCurrentTemplate(null);
        setTemplateName('');
        setTemplateDescription('');
        setZplCode('');
        setSelectedTemplateId('');
      }
      toast.success('Template deleted');
    } catch (error) {
      console.error('Failed to delete template:', error);
      toast.error('Failed to delete template');
    }
  };

  const handleCreateThirdsTemplate = () => {
    const thirdsZpl = zplPriceBarcodeThirds2x1({
      condition: '{{CONDITION}}',
      priceDisplay: '{{PRICE}}',
      sku: '{{SKU}}',
      title: '{{CARDNAME}} • {{SETNAME}} • {{CARDNUMBER}}',
      dpi: 203,
      copies: 1
    });
    
    setZplCode(thirdsZpl);
    setTemplateName('Price Barcode Thirds 2x1');
    setTemplateDescription('2"×1" label with thirds layout - condition/price top, barcode middle, title bottom');
    toast.success('Thirds template created');
  };

  const handleTestPrint = async () => {
    try {
      if (!generatedZpl || generatedZpl.trim().length === 0) {
        toast.error('No ZPL generated. Check template configuration.');
        return;
      }
      
      console.log('🖨️ Test print - Generated ZPL:', generatedZpl);
      
      const result = await print(generatedZpl, printerPrefs.copies || 1);
      
      if (result.success) {
        toast.success('Test print sent successfully!', {
          description: result.jobId ? `Job ID: ${result.jobId}` : 'Print job submitted'
        });
      } else {
        toast.error('Print failed', {
          description: result.error || 'Unknown error occurred'
        });
      }
    } catch (error) {
      console.error('Print failed:', error);
      toast.error('Print failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  const copyZplToClipboard = () => {
    navigator.clipboard.writeText(generatedZpl);
    toast.success('ZPL copied to clipboard');
  };

  const handleNewTemplate = () => {
    setCurrentTemplate(null);
    setTemplateName('');
    setTemplateDescription('');
    setZplCode('');
    setSelectedTemplateId('');
    setGeneratedZpl('');
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Label Studio - Code Only</h1>
        <p className="text-muted-foreground">Manage ZPL label templates with code</p>
      </div>

      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="editor">ZPL Editor</TabsTrigger>
          <TabsTrigger value="preview">Preview & Test</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Template Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button onClick={handleNewTemplate} variant="outline">
                  New Template
                </Button>
                <Button onClick={handleCreateThirdsTemplate} variant="outline">
                  Create Thirds Template
                </Button>
              </div>
              
              <div className="space-y-2">
                <Label>Load Existing Template</Label>
                <div className="flex gap-2">
                  <Select value={selectedTemplateId} onValueChange={handleLoadTemplate}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTemplates.map(template => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                          {template.is_default && <Badge variant="secondary" className="ml-2">Default</Badge>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTemplateId && (
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => handleDeleteTemplate(selectedTemplateId)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableTemplates.map(template => (
                  <Card key={template.id} className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-medium">{template.name}</h3>
                        {template.is_default && <Badge variant="secondary">Default</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{template.description}</p>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleLoadTemplate(template.id)}
                        >
                          Load
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => handleDeleteTemplate(template.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="editor" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="w-5 h-5" />
                ZPL Code Editor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="template-name">Template Name</Label>
                  <Input
                    id="template-name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Enter template name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template-description">Description</Label>
                  <Input
                    id="template-description"
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="Enter template description"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="zpl-code">ZPL Code</Label>
                <Textarea
                  id="zpl-code"
                  value={zplCode}
                  onChange={(e) => setZplCode(e.target.value)}
                  placeholder="Enter ZPL code here... Use {{CARDNAME}}, {{CONDITION}}, {{PRICE}}, {{SKU}}, {{BARCODE}} for variables"
                  className="min-h-[300px] font-mono text-sm"
                />
              </div>
              
              <div className="flex gap-2">
                <Button onClick={handleSaveTemplate}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Template
                </Button>
              </div>
              
              <div className="p-4 bg-muted rounded">
                <h4 className="font-medium mb-2">Available Variables:</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <code>{'{{CARDNAME}}'}</code>
                  <code>{'{{CONDITION}}'}</code>
                  <code>{'{{PRICE}}'}</code>
                  <code>{'{{SKU}}'}</code>
                  <code>{'{{BARCODE}}'}</code>
                  <code>{'{{SETNAME}}'}</code>
                  <code>{'{{CARDNUMBER}}'}</code>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TestTube className="w-5 h-5" />
                  Test Variables
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Card Name</Label>
                    <Input
                      value={testVars.CARDNAME}
                      onChange={(e) => setTestVars(prev => ({ ...prev, CARDNAME: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Condition</Label>
                    <Input
                      value={testVars.CONDITION}
                      onChange={(e) => setTestVars(prev => ({ ...prev, CONDITION: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Price</Label>
                    <Input
                      value={testVars.PRICE}
                      onChange={(e) => setTestVars(prev => ({ ...prev, PRICE: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SKU</Label>
                    <Input
                      value={testVars.SKU}
                      onChange={(e) => setTestVars(prev => ({ ...prev, SKU: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Barcode</Label>
                    <Input
                      value={testVars.BARCODE}
                      onChange={(e) => setTestVars(prev => ({ ...prev, BARCODE: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Set Name</Label>
                    <Input
                      value={testVars.SETNAME}
                      onChange={(e) => setTestVars(prev => ({ ...prev, SETNAME: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Card Number</Label>
                    <Input
                      value={testVars.CARDNUMBER}
                      onChange={(e) => setTestVars(prev => ({ ...prev, CARDNUMBER: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  Generated ZPL Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={generatedZpl}
                  readOnly
                  className="min-h-[300px] font-mono text-xs"
                  placeholder="Generated ZPL will appear here..."
                />
                <div className="flex gap-2">
                  <Button onClick={copyZplToClipboard} variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Copy ZPL
                  </Button>
                  <Button onClick={handleTestPrint} size="sm">
                    <Printer className="w-4 h-4 mr-2" />
                    Test Print
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Printer Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Use PrintNode</Label>
                  <Switch
                    checked={printerPrefs.usePrintNode}
                    onCheckedChange={(checked) => setPrinterPrefs(prev => ({ ...prev, usePrintNode: checked }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Print Speed (IPS): {printerPrefs.speed}</Label>
                  <Slider
                    value={[printerPrefs.speed || 4]}
                    onValueChange={([value]) => setPrinterPrefs(prev => ({ ...prev, speed: value }))}
                    min={1}
                    max={14}
                    step={1}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Darkness: {printerPrefs.darkness}</Label>
                  <Slider
                    value={[printerPrefs.darkness || 10]}
                    onValueChange={([value]) => setPrinterPrefs(prev => ({ ...prev, darkness: value }))}
                    min={1}
                    max={30}
                    step={1}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Copies: {printerPrefs.copies}</Label>
                  <Slider
                    value={[printerPrefs.copies || 1]}
                    onValueChange={([value]) => setPrinterPrefs(prev => ({ ...prev, copies: value }))}
                    min={1}
                    max={10}
                    step={1}
                  />
                </div>
                
                <Button 
                  onClick={() => {
                    localStorage.setItem('zebra-printer-config', JSON.stringify(printerPrefs));
                    toast.success('Printer settings saved');
                  }}
                >
                  Save Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}