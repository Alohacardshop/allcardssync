import React, { useState, useEffect } from 'react';
import EditorCanvas from './components/EditorCanvas';
import ElementToolbar from './components/ElementToolbar';
import { DragDropProvider } from '@/components/drag-drop/DragDropProvider';
import { EnhancedPrintNodeSelector } from '@/components/EnhancedPrintNodeSelector';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
  Palette,
  Square,
  Type,
  BarChart3,
  Minus
} from "lucide-react";
import type { 
  LabelTemplate, 
  ZPLElement, 
  LabelLayout,
  PrinterPrefs,
  JobVars
} from "@/lib/labels/types";
import { 
  getTemplate,
  saveLocalTemplate, 
  saveOrgTemplate,
  codeDefaultRawCard2x1 
} from "@/lib/labels/templateStore";
import { setAsDefault, deleteTemplate } from "@/lib/templateStore";
import { zplFromElements, zplFromTemplateString } from "@/lib/labels/zpl";
import { applyVariablesToZpl } from "@/lib/labels/zplElementConverter";
import { sendZplToPrinter } from "@/lib/labels/print";
import { toast } from "sonner";
import { supabase } from '@/integrations/supabase/client';

export default function LabelStudio() {
  const [template, setTemplate] = useState<LabelTemplate>(codeDefaultRawCard2x1());
  const [selectedElement, setSelectedElement] = useState<ZPLElement | null>(null);
  const [printerPrefs, setPrinterPrefs] = useState<PrinterPrefs>({
    usePrintNode: true,
    speed: 4,
    darkness: 10,
    copies: 1,
    media: 'gap',
    leftShift: 0
  });
  const [testVars, setTestVars] = useState<JobVars>({
    CARDNAME: 'Pikachu VMAX',
    SETNAME: 'Vivid Voltage',
    CARDNUMBER: '#047',
    CONDITION: 'NM',
    PRICE: '$24.99',
    SKU: 'PKM-001',
    BARCODE: 'PKM001'
  });
  const [templateName, setTemplateName] = useState('');
  const [availableTemplates, setAvailableTemplates] = useState<Array<{id: string, name: string, is_default: boolean}>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [generatedZpl, setGeneratedZpl] = useState('');

  // Load printer config on mount and auto-load default printer
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

  // Load template on mount
  useEffect(() => {
    const loadTemplate = async () => {
      try {
        const tpl = await getTemplate('raw_card_2x1');
        console.log('🏷️ Loaded template from templateStore:', tpl);
        
        // Convert templateStore format to types format
        let convertedTemplate: LabelTemplate;
        
        // Cast to the templateStore LabelTemplate type to access its properties
        const storeTpl = tpl as any;
        
        if (storeTpl.format === 'elements' && storeTpl.elements) {
          convertedTemplate = {
            id: storeTpl.id,
            name: storeTpl.id,
            type: storeTpl.type,
            format: 'elements' as const,
            layout: {
              width: storeTpl.width,
              height: storeTpl.height,
              dpi: storeTpl.dpi,
              elements: storeTpl.elements as ZPLElement[]
            },
            is_default: storeTpl.is_default,
            updated_at: storeTpl.updated_at,
            scope: storeTpl.scope
          };
        } else if (storeTpl.format === 'zpl' && storeTpl.zpl) {
          const zplData = storeTpl.zpl as any; // Handle type mismatch
          // Check if zpl is a string (raw ZPL) or object (element data)
          if (typeof zplData === 'string') {
            // Raw ZPL string - keep as ZPL format
            convertedTemplate = {
              id: storeTpl.id,
              name: storeTpl.name || storeTpl.id,
              type: storeTpl.type,
              format: 'zpl' as const,
              zpl: zplData,
              is_default: storeTpl.is_default,
              updated_at: storeTpl.updated_at,
              scope: storeTpl.scope
            };
          } else {
            // Object with elements - convert to elements format and normalize element structure
            const normalizedElements = (zplData.elements || []).map((el: any) => {
              const baseEl = {
                type: el.type,
                id: el.id,
                x: el.position?.x ?? el.x ?? 0,
                y: el.position?.y ?? el.y ?? 0,
              };

              if (el.type === 'text') {
                return {
                  ...baseEl,
                  text: el.text || '',
                  font: el.font,
                  h: el.boundingBox?.height ?? el.h ?? el.fontSize ?? 30,
                  w: el.boundingBox?.width ?? el.w ?? el.fontWidth ?? 30,
                  maxWidth: el.boundingBox?.width ?? el.maxWidth
                };
              } else if (el.type === 'barcode') {
                return {
                  ...baseEl,
                  data: el.data || '',
                  height: el.size?.height ?? el.height ?? 52,
                  moduleWidth: el.moduleWidth ?? 2,
                  hr: el.humanReadable ?? false
                };
              } else if (el.type === 'line') {
                return {
                  ...baseEl,
                  x2: el.x2 ?? baseEl.x + 50,
                  y2: el.y2 ?? baseEl.y + 50,
                  thickness: el.thickness ?? 2
                };
              }
              
              return baseEl;
            });

            convertedTemplate = {
              id: storeTpl.id,
              name: storeTpl.name || storeTpl.id,
              type: storeTpl.type,
              format: 'elements' as const,
              layout: {
                dpi: zplData.dpi || 203,
                width: zplData.width || 406,
                height: zplData.height || 203,
                elements: normalizedElements
              },
              is_default: storeTpl.is_default,
              updated_at: storeTpl.updated_at,
              scope: storeTpl.scope
            };
          }
        } else {
          // Fallback to default template
          convertedTemplate = codeDefaultRawCard2x1();
        }
        
        console.log('🏷️ Converted template for LabelStudio:', convertedTemplate);
        setTemplate(convertedTemplate);
      } catch (error) {
        console.error('Failed to load template:', error);
        toast.error('Failed to load template');
      }
    };
    loadTemplate();
  }, []);

  // Load available templates on mount
  useEffect(() => {
    loadAvailableTemplates();
  }, []);

  // Generate ZPL whenever template or test vars change
  useEffect(() => {
    console.log('🔄 ZPL Generation useEffect triggered');
    console.log('📋 Template:', template);
    console.log('🧪 Test vars:', testVars);
    console.log('🖨️ Printer prefs:', printerPrefs);
    
    try {
      let zpl = '';
      if (template.format === 'elements' && template.layout) {
        console.log('🔧 Processing elements template with', template.layout.elements.length, 'elements');
        const filledLayout = fillElements(template.layout, testVars);
        console.log('📝 Filled layout:', filledLayout);
        zpl = zplFromElements(filledLayout, printerPrefs);
        console.log('✅ Generated ZPL from elements (length):', zpl.length);
      } else if (template.zpl) {
        console.log('📝 Processing ZPL template');
        // Apply test variables to existing ZPL
        zpl = applyVariablesToZpl(template.zpl, testVars);
        console.log('✅ Generated ZPL with variables (length):', zpl.length);
      } else {
        console.warn('⚠️ No valid template format found:', template);
        console.warn('⚠️ Template format:', template.format);
        console.warn('⚠️ Has layout:', !!template.layout);
        console.warn('⚠️ Has zpl:', !!template.zpl);
      }
      setGeneratedZpl(zpl);
      console.log('🎯 Final ZPL set:', zpl.length, 'characters');
    } catch (error) {
      console.error('❌ ZPL generation error:', error);
      setGeneratedZpl('// Error generating ZPL: ' + (error instanceof Error ? error.message : String(error)));
    }
  }, [template, testVars, printerPrefs]);

  const fillElements = (layout: any, vars: JobVars) => {
    console.log('🔧 fillElements input layout:', layout);
    console.log('🔧 fillElements vars:', vars);
    
    const copy = structuredClone(layout);
    if (!copy.elements || !Array.isArray(copy.elements)) {
      console.warn('⚠️ No elements array found in layout:', copy);
      return copy;
    }
    
    copy.elements = copy.elements.map((el: any) => {
      console.log('🔧 Processing element:', el);
      
      if (el.type === 'text') {
        if (el.id === 'cardinfo') {
          // Combine card name, set name, and number into one field
          const cardName = vars.CARDNAME ?? 'CARD NAME';
          const setInfo = vars.SETNAME ?? 'Set Name';
          const cardNumber = vars.CARDNUMBER ?? '#001';
          el.text = `${cardName} • ${setInfo} • ${cardNumber}`;
        }
        if (el.id === 'condition') el.text = vars.CONDITION ?? el.text;
        if (el.id === 'price') el.text = vars.PRICE ?? el.text;
        if (el.id === 'sku') el.text = vars.SKU ?? el.text;
        
        // Handle elements that don't have specific IDs but might contain placeholder text
        if (!el.id || el.id.startsWith('text-')) {
          if (el.text && typeof el.text === 'string') {
            // Replace common placeholders in the text
            el.text = el.text
              .replace(/{{CARDNAME}}/g, vars.CARDNAME ?? 'CARD NAME')
              .replace(/{{CONDITION}}/g, vars.CONDITION ?? 'NM')
              .replace(/{{PRICE}}/g, vars.PRICE ?? '$0.00')
              .replace(/{{SKU}}/g, vars.SKU ?? 'SKU123');
          }
        }
      }
      if (el.type === 'barcode' && (el.id === 'barcode' || el.id?.startsWith('barcode-'))) {
        el.data = vars.BARCODE ?? el.data ?? 'SKU123';
      }
      
      console.log('🔧 Processed element result:', el);
      return el;
    });
    
    console.log('🔧 fillElements result:', copy);
    return copy;
  };

  const handleSaveLocal = () => {
    if (!template.name) {
      toast.error('Please enter a template name');
      return;
    }
    
    try {
      // Always save as ZPL format - templateStore will convert elements to ZPL
      const templateToSave: LabelTemplate = {
        ...template,
        format: 'elements', // Keep as elements internally for visual editor
        id: template.id || template.name.toLowerCase().replace(/\s+/g, '_'),
        scope: 'local'
      };
      
      saveLocalTemplate(templateToSave);
      toast.success('Template saved locally');
    } catch (error) {
      console.error('Save failed:', error);
      toast.error('Failed to save template');
    }
  };

  const handleSaveOrg = async () => {
    if (!template.name) {
      toast.error('Please enter a template name');
      return;
    }
    
    try {
      // Always save as ZPL format - templateStore will convert elements to ZPL
      const templateToSave: LabelTemplate = {
        ...template,
        format: 'elements', // Keep as elements internally for visual editor
        id: template.id || template.name.toLowerCase().replace(/\s+/g, '_'),
        name: template.name,
        type: template.name.toLowerCase().replace(/\s+/g, '_'),
        is_default: false,
        scope: 'org'
      };
      
      await saveOrgTemplate(templateToSave);
      await loadAvailableTemplates(); // Refresh the list
      toast.success('Template saved to organization');
    } catch (error) {
      console.error('Save failed:', error);
      toast.error('Failed to save template to organization');
    }
  };

  const handleTestPrint = async () => {
    try {
      console.log('🖨️ Test print - Generated ZPL length:', generatedZpl.length);
      console.log('🖨️ Test print - Generated ZPL:', generatedZpl);
      
      if (!generatedZpl || generatedZpl.trim().length === 0) {
        toast.error('No ZPL generated. Check template configuration.');
        return;
      }
      
      await sendZplToPrinter(generatedZpl, `Test-${Date.now()}`, printerPrefs);
      toast.success('Test print sent');
    } catch (error) {
      console.error('Print failed:', error);
      toast.error('Print failed');
    }
  };

  const handleSavePrinterConfig = () => {
    try {
      localStorage.setItem('zebra-printer-config', JSON.stringify(printerPrefs));
      toast.success('Printer settings saved');
    } catch (error) {
      console.error('Save failed:', error);
      toast.error('Failed to save printer settings');
    }
  };

  const loadAvailableTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('label_templates')
        .select('id, name, is_default')
        .eq('template_type', 'raw');
      
      if (error) throw error;
      setAvailableTemplates(data || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
      toast.error('Failed to load available templates');
    }
  };

  const handleLoadTemplate = async (templateId: string) => {
    try {
      const loadedTemplate = await getTemplate(templateId);
      setTemplate(loadedTemplate);
      setSelectedTemplateId(templateId);
      toast.success('Template loaded successfully');
    } catch (error) {
      console.error('Failed to load template:', error);
      toast.error('Failed to load template');
    }
  };

  const handleSetAsDefault = async (templateId?: string) => {
    const idToUse = templateId || template.id;
    if (!idToUse) {
      toast.error('Please select or save template first');
      return;
    }
    
    try {
      await setAsDefault(idToUse, 'raw_card_2x1');
      await loadAvailableTemplates(); // Refresh the list
      toast.success('Template set as default');
    } catch (error) {
      console.error('Failed to set as default:', error);
      toast.error('Failed to set as default');
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    
    try {
      await deleteTemplate(templateId);
      await loadAvailableTemplates(); // Refresh the list
      if (template.id === templateId) {
        setTemplate(codeDefaultRawCard2x1()); // Reset to default
        setSelectedTemplateId('');
      }
      toast.success('Template deleted');
    } catch (error) {
      console.error('Failed to delete template:', error);
      toast.error('Failed to delete template');
    }
  };

  const handleSaveWithName = async () => {
    if (!templateName.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    
    try {
      const templateToSave = {
        ...template,
        id: templateName.toLowerCase().replace(/\s+/g, '_'),
        name: templateName
      };
      
      await saveOrgTemplate(templateToSave);
      await loadAvailableTemplates(); // Refresh the list
      setTemplateName('');
      toast.success('Template saved successfully');
    } catch (error) {
      console.error('Failed to save template:', error);
      toast.error('Failed to save template');
    }
  };

  const copyZplToClipboard = () => {
    navigator.clipboard.writeText(generatedZpl);
    toast.success('ZPL copied to clipboard');
  };

  const scale = 1.5; // Editor scale for precision
  const previewScale = 0.5; // Preview scale

  const handleAddElement = (type: 'text' | 'barcode' | 'line') => {
    if (!template.layout) return;
    
    const newElement: ZPLElement = type === 'text' 
      ? { type: 'text', x: 50, y: 50, text: 'New Text', h: 30, w: 100 }
      : type === 'barcode'
      ? { type: 'barcode', x: 50, y: 50, data: '123456', height: 52, moduleWidth: 2 }
      : { type: 'line', x: 50, y: 50, x2: 150, y2: 50, thickness: 1 };

    setTemplate(prev => ({
      ...prev,
      layout: {
        ...prev.layout!,
        elements: [...prev.layout!.elements, newElement]
      }
    }));
  };

  return (
    <DragDropProvider>
      <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Label Studio</h1>
        <p className="text-muted-foreground">Design and manage label templates</p>
      </div>

      <Tabs defaultValue="editor" className="space-y-4">
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="properties">Properties</TabsTrigger>
          <TabsTrigger value="printer">Printer</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="test">Test</TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="space-y-4">
          {/* Enhanced Visual Editor with Toolbar */}
          <Card>
            <CardHeader>
              <CardTitle>Visual Editor</CardTitle>
              <div className="flex gap-2 mt-2">
                <ElementToolbar onAddElement={handleAddElement} />
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Drag elements from the toolbar to the canvas. Select elements to resize or press Delete to remove them.
              </p>
            </CardHeader>
            <CardContent>
              <EditorCanvas
                template={template}
                scale={1.5}
                onChangeTemplate={setTemplate}
                onSelectElement={setSelectedElement}
                testVars={testVars}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          {/* Template Selection and Loading */}
          <Card>
            <CardHeader>
              <CardTitle>Template Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Load Existing Template */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Load Template</h3>
                  <div>
                    <Label>Available Templates</Label>
                    <Select
                      value={selectedTemplateId}
                      onValueChange={setSelectedTemplateId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a template..." />
                      </SelectTrigger>
                      <SelectContent className="bg-background border border-border shadow-md z-50">
                        {availableTemplates.map((tpl) => (
                          <SelectItem key={tpl.id} value={tpl.id}>
                            {tpl.name} {tpl.is_default && <Badge variant="secondary" className="ml-2">Default</Badge>}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => selectedTemplateId && handleLoadTemplate(selectedTemplateId)}
                      disabled={!selectedTemplateId}
                      className="flex-1"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Load Template
                    </Button>
                    <Button 
                      onClick={() => selectedTemplateId && handleSetAsDefault(selectedTemplateId)}
                      disabled={!selectedTemplateId}
                      variant="outline"
                    >
                      Set as Default
                    </Button>
                  </div>
                  {availableTemplates.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No templates available
                    </p>
                  )}
                </div>

                {/* Save Current Template */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Save Current Template</h3>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="template-name">Template Name</Label>
                      <Input
                        id="template-name"
                        value={template.name}
                        onChange={(e) => setTemplate(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Enter template name..."
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleSaveLocal} variant="outline" className="flex-1">
                        Save (Local)
                      </Button>
                      <Button onClick={handleSaveOrg} className="flex-1">
                        <Save className="w-4 h-4 mr-2" />
                        Save (Org)
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Template Actions */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    <strong>Current scope:</strong> {template.scope || 'unknown'}
                    <br />
                    <strong>Format:</strong> ZPL (auto-converted from visual elements)
                    <br />
                    <strong>Load order:</strong> Supabase (Org) → Local override → Code default
                  </div>
                  <Button 
                    onClick={() => selectedTemplateId && handleDeleteTemplate(selectedTemplateId)}
                    disabled={!selectedTemplateId}
                    variant="destructive"
                  >
                    Delete Selected
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="properties" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Element Properties</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedElement ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>X Position</Label>
                      <Input
                        type="number"
                        value={selectedElement.x}
                        onChange={(e) => {
                          const x = parseInt(e.target.value) || 0;
                          setSelectedElement(prev => prev ? { ...prev, x } : null);
                          // Update template
                          if (template.layout) {
                            const elements = template.layout.elements.map(el => 
                              el === selectedElement ? { ...el, x } : el
                            );
                            setTemplate(prev => ({
                              ...prev,
                              layout: { ...template.layout!, elements }
                            }));
                          }
                        }}
                      />
                    </div>
                    <div>
                      <Label>Y Position</Label>
                      <Input
                        type="number"
                        value={selectedElement.y}
                        onChange={(e) => {
                          const y = parseInt(e.target.value) || 0;
                          setSelectedElement(prev => prev ? { ...prev, y } : null);
                          // Update template
                          if (template.layout) {
                            const elements = template.layout.elements.map(el => 
                              el === selectedElement ? { ...el, y } : el
                            );
                            setTemplate(prev => ({
                              ...prev,
                              layout: { ...template.layout!, elements }
                            }));
                          }
                        }}
                      />
                    </div>
                  </div>

                  {selectedElement.type === 'text' && (
                    <>
                      <div>
                        <Label>Text</Label>
                        <Input
                          value={selectedElement.text}
                          onChange={(e) => {
                            const text = e.target.value;
                            setSelectedElement(prev => prev ? { ...prev, text } : null);
                            // Update template
                            if (template.layout) {
                              const elements = template.layout.elements.map(el => 
                                el === selectedElement ? { ...el, text } : el
                              );
                              setTemplate(prev => ({
                                ...prev,
                                layout: { ...template.layout!, elements }
                              }));
                            }
                          }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Height</Label>
                          <Input
                            type="number"
                            value={selectedElement.h || 30}
                            onChange={(e) => {
                              const h = parseInt(e.target.value) || 30;
                              setSelectedElement(prev => prev ? { ...prev, h } : null);
                              // Update template
                              if (template.layout) {
                                const elements = template.layout.elements.map(el => 
                                  el === selectedElement ? { ...el, h } : el
                                );
                                setTemplate(prev => ({
                                  ...prev,
                                  layout: { ...template.layout!, elements }
                                }));
                              }
                            }}
                          />
                        </div>
                        <div>
                          <Label>Width</Label>
                          <Input
                            type="number"
                            value={selectedElement.w || 30}
                            onChange={(e) => {
                              const w = parseInt(e.target.value) || 30;
                              setSelectedElement(prev => prev ? { ...prev, w } : null);
                              // Update template
                              if (template.layout) {
                                const elements = template.layout.elements.map(el => 
                                  el === selectedElement ? { ...el, w } : el
                                );
                                setTemplate(prev => ({
                                  ...prev,
                                  layout: { ...template.layout!, elements }
                                }));
                              }
                            }}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {selectedElement.type === 'barcode' && (
                    <>
                      <div>
                        <Label>Barcode Data</Label>
                        <Input
                          value={selectedElement.data}
                          onChange={(e) => {
                            const data = e.target.value;
                            setSelectedElement(prev => prev ? { ...prev, data } : null);
                            // Update template
                            if (template.layout) {
                              const elements = template.layout.elements.map(el => 
                                el === selectedElement ? { ...el, data } : el
                              );
                              setTemplate(prev => ({
                                ...prev,
                                layout: { ...template.layout!, elements }
                              }));
                            }
                          }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Height</Label>
                          <Input
                            type="number"
                            value={selectedElement.height || 52}
                            onChange={(e) => {
                              const height = parseInt(e.target.value) || 52;
                              setSelectedElement(prev => prev ? { ...prev, height } : null);
                              // Update template
                              if (template.layout) {
                                const elements = template.layout.elements.map(el => 
                                  el === selectedElement ? { ...el, height } : el
                                );
                                setTemplate(prev => ({
                                  ...prev,
                                  layout: { ...template.layout!, elements }
                                }));
                              }
                            }}
                          />
                        </div>
                        <div>
                          <Label>Module Width</Label>
                          <Input
                            type="number"
                            value={selectedElement.moduleWidth || 2}
                            onChange={(e) => {
                              const moduleWidth = parseInt(e.target.value) || 2;
                              setSelectedElement(prev => prev ? { ...prev, moduleWidth } : null);
                              // Update template
                              if (template.layout) {
                                const elements = template.layout.elements.map(el => 
                                  el === selectedElement ? { ...el, moduleWidth } : el
                                );
                                setTemplate(prev => ({
                                  ...prev,
                                  layout: { ...template.layout!, elements }
                                }));
                              }
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="hr-toggle"
                          checked={selectedElement.hr || false}
                          onCheckedChange={(hr) => {
                            setSelectedElement(prev => prev ? { ...prev, hr } : null);
                            // Update template
                            if (template.layout) {
                              const elements = template.layout.elements.map(el => 
                                el === selectedElement ? { ...el, hr } : el
                              );
                              setTemplate(prev => ({
                                ...prev,
                                layout: { ...template.layout!, elements }
                              }));
                            }
                          }}
                        />
                        <Label htmlFor="hr-toggle">Human Readable</Label>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">Select an element to edit its properties</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="printer" className="space-y-4">
          <EnhancedPrintNodeSelector 
            printerPrefs={printerPrefs}
            onPrefsChange={setPrinterPrefs}
          />
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Advanced Printer Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Speed</Label>
                  <Input
                    type="number"
                    value={printerPrefs.speed || 4}
                    onChange={(e) => 
                      setPrinterPrefs(prev => ({ 
                        ...prev, 
                        speed: parseInt(e.target.value) || 4 
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Darkness</Label>
                  <Input
                    type="number"
                    value={printerPrefs.darkness || 10}
                    onChange={(e) => 
                      setPrinterPrefs(prev => ({ 
                        ...prev, 
                        darkness: parseInt(e.target.value) || 10 
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Copies</Label>
                  <Input
                    type="number"
                    value={printerPrefs.copies || 1}
                    onChange={(e) => 
                      setPrinterPrefs(prev => ({ 
                        ...prev, 
                        copies: parseInt(e.target.value) || 1 
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Left Shift</Label>
                  <Input
                    type="number"
                    value={printerPrefs.leftShift || 0}
                    onChange={(e) => 
                      setPrinterPrefs(prev => ({ 
                        ...prev, 
                        leftShift: parseInt(e.target.value) || 0 
                      }))
                    }
                  />
                </div>
              </div>

              <div>
                <Label>Media Type</Label>
                <Select
                  value={printerPrefs.media || 'gap'}
                  onValueChange={(value: 'gap' | 'blackmark' | 'continuous') => 
                    setPrinterPrefs(prev => ({ ...prev, media: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border border-border shadow-md z-50">
                    <SelectItem value="gap">Gap</SelectItem>
                    <SelectItem value="blackmark">Blackmark</SelectItem>
                    <SelectItem value="continuous">Continuous</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleSavePrinterConfig} className="w-full">
                Save Printer Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
              </CardHeader>
              <CardContent>
                 <div 
                   className="border-2 border-gray-300 bg-white relative"
                   style={{ 
                     width: `${(template.layout?.width || 406) * previewScale}px`, 
                     height: `${(template.layout?.height || 203) * previewScale}px` 
                   }}
                 >
                   {template.format === 'elements' && template.layout?.elements && template.layout.elements.length > 0 ? 
                     template.layout.elements.map((el, i) => {
                       // Fill with test data for preview using same logic as visual editor
                       let displayText = '';
                       
                       if (el.type === 'text') {
                         displayText = el.text;
                         
                         // Apply test variable replacements
                         if (el.id === 'cardinfo') {
                           const cardName = testVars.CARDNAME ?? 'CARD NAME';
                           const setInfo = testVars.SETNAME ?? 'Set Name';
                           const cardNumber = testVars.CARDNUMBER ?? '#001';
                           displayText = `${cardName} • ${setInfo} • ${cardNumber}`;
                         } else if (el.id === 'condition') {
                           displayText = testVars.CONDITION ?? el.text;
                         } else if (el.id === 'price') {
                           displayText = testVars.PRICE ?? el.text;
                         } else if (el.id === 'sku') {
                           displayText = testVars.SKU ?? el.text;
                         } else {
                           // Handle placeholder replacements
                           if (displayText && typeof displayText === 'string') {
                             displayText = displayText
                               .replace(/{{CARDNAME}}/g, testVars.CARDNAME ?? 'CARD NAME')
                               .replace(/{{CONDITION}}/g, testVars.CONDITION ?? 'NM')
                               .replace(/{{PRICE}}/g, testVars.PRICE ?? '$0.00')
                               .replace(/{{SKU}}/g, testVars.SKU ?? 'SKU123');
                           }
                         }
                       } else if (el.type === 'barcode') {
                         displayText = el.data;
                         if (el.id === 'barcode' || el.id?.startsWith('barcode-')) {
                           displayText = testVars.BARCODE ?? el.data ?? 'SKU123';
                         }
                       }

                       return (
                         <div
                           key={i}
                           className="absolute border border-gray-400 bg-gray-100 text-xs p-1 overflow-hidden"
                            style={{
                              left: `${el.x * previewScale}px`,
                              top: `${el.y * previewScale}px`,
                              width: el.type === 'text' ? `${((el as any).w || 100) * previewScale}px` : 'auto',
                              height: el.type === 'text' ? `${((el as any).h || 30) * previewScale}px` : `${20 * previewScale}px`,
                              fontSize: `${Math.max(6, (el.type === 'text' ? (el as any).h || 30 : 12) * previewScale)}px`,
                              lineHeight: '1.2'
                            }}
                         >
                           {el.type === 'barcode' ? `[${displayText}]` : displayText}
                         </div>
                       );
                     })
                     : (
                       <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
                         No elements in template
                       </div>
                     )
                   }
                 </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  Generated ZPL
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={copyZplToClipboard}
                  >
                    Copy
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={generatedZpl}
                  readOnly
                  className="font-mono text-sm"
                  rows={20}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="test" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Test Variables</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Card Name</Label>
                  <Input
                    value={testVars.CARDNAME || ''}
                    onChange={(e) => setTestVars(prev => ({ ...prev, CARDNAME: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Set Name</Label>
                  <Input
                    value={testVars.SETNAME || ''}
                    onChange={(e) => setTestVars(prev => ({ ...prev, SETNAME: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Card Number</Label>
                  <Input
                    value={testVars.CARDNUMBER || ''}
                    onChange={(e) => setTestVars(prev => ({ ...prev, CARDNUMBER: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Condition</Label>
                  <Input
                    value={testVars.CONDITION || ''}
                    onChange={(e) => setTestVars(prev => ({ ...prev, CONDITION: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Price</Label>
                  <Input
                    value={testVars.PRICE || ''}
                    onChange={(e) => setTestVars(prev => ({ ...prev, PRICE: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>SKU</Label>
                  <Input
                    value={testVars.SKU || ''}
                    onChange={(e) => setTestVars(prev => ({ ...prev, SKU: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Barcode</Label>
                  <Input
                    value={testVars.BARCODE || ''}
                    onChange={(e) => setTestVars(prev => ({ ...prev, BARCODE: e.target.value }))}
                  />
                </div>
              </div>

              <Button onClick={handleTestPrint} className="w-full">
                Test Print
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </DragDropProvider>
  );
}