import React, { useState, useEffect } from 'react';
import EditorCanvas from './components/EditorCanvas';
import ElementToolbar from './components/ElementToolbar';
import { DragDropProvider } from '@/components/drag-drop/DragDropProvider';
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
import { zplFromElements, zplFromTemplateString } from "@/lib/labels/zpl";
import { sendZplToPrinter } from "@/lib/labels/print";
import { toast } from "sonner";

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
  const [generatedZpl, setGeneratedZpl] = useState('');

  // Load printer config on mount
  useEffect(() => {
    try {
      const cfg = JSON.parse(localStorage.getItem('zebra-printer-config') || '{}');
      setPrinterPrefs(prev => ({ ...prev, ...cfg }));
    } catch (error) {
      console.error('Failed to load printer config:', error);
    }
  }, []);

  // Load template on mount
  useEffect(() => {
    const loadTemplate = async () => {
      try {
        const tpl = await getTemplate('raw_card_2x1');
        setTemplate(tpl);
      } catch (error) {
        console.error('Failed to load template:', error);
        toast.error('Failed to load template');
      }
    };
    loadTemplate();
  }, []);

  // Generate ZPL whenever template or test vars change
  useEffect(() => {
    try {
      let zpl = '';
      if (template.format === 'elements' && template.layout) {
        const filledLayout = fillElements(template.layout, testVars);
        zpl = zplFromElements(filledLayout, printerPrefs);
      } else if (template.format === 'zpl' && template.zpl) {
        zpl = zplFromTemplateString(template.zpl, testVars);
      }
      setGeneratedZpl(zpl);
    } catch (error) {
      console.error('ZPL generation error:', error);
      setGeneratedZpl('// Error generating ZPL');
    }
  }, [template, testVars, printerPrefs]);

  const fillElements = (layout: any, vars: JobVars) => {
    const copy = structuredClone(layout);
    copy.elements = copy.elements.map((el: ZPLElement) => {
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
      }
      if (el.type === 'barcode' && el.id === 'barcode') {
        el.data = vars.BARCODE ?? el.data;
      }
      return el;
    });
    return copy;
  };

  const handleSaveLocal = () => {
    try {
      saveLocalTemplate(template);
      toast.success('Template saved locally');
    } catch (error) {
      console.error('Save failed:', error);
      toast.error('Failed to save template');
    }
  };

  const handleSaveOrg = async () => {
    try {
      await saveOrgTemplate({ ...template, scope: 'org' });
      toast.success('Template saved to organization');
    } catch (error) {
      console.error('Save failed:', error);
      toast.error('Failed to save template to organization');
    }
  };

  const handleTestPrint = async () => {
    try {
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

      <Tabs defaultValue="template" className="space-y-4">
        <TabsList>
          <TabsTrigger value="template">Template</TabsTrigger>
          <TabsTrigger value="properties">Properties</TabsTrigger>
          <TabsTrigger value="printer">Printer</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="test">Test</TabsTrigger>
        </TabsList>

        <TabsContent value="template" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Template Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label htmlFor="template-name">Template Name</Label>
                  <Input
                    id="template-name"
                    value={template.name}
                    onChange={(e) => setTemplate(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="template-format">Format</Label>
                  <Select
                    value={template.format}
                    onValueChange={(value: 'elements' | 'zpl') => 
                      setTemplate(prev => ({ ...prev, format: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="elements">Elements</SelectItem>
                      <SelectItem value="zpl">Raw ZPL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSaveLocal} variant="outline">
                  Save (Local)
                </Button>
                <Button onClick={handleSaveOrg}>
                  Save (Org)
                </Button>
              </div>

              <div className="text-sm text-muted-foreground">
                <strong>Current scope:</strong> {template.scope || 'unknown'}
                <br />
                <strong>Load order:</strong> Supabase (Org) → Local override → Code default
              </div>
            </CardContent>
          </Card>

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
                    scale={scale}
                    onChangeTemplate={setTemplate}
                    onSelectElement={setSelectedElement}
                  />
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
          <Card>
            <CardHeader>
              <CardTitle>Printer Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="use-printnode"
                  checked={printerPrefs.usePrintNode || false}
                  onCheckedChange={(usePrintNode) => 
                    setPrinterPrefs(prev => ({ ...prev, usePrintNode }))
                  }
                />
                <Label htmlFor="use-printnode">Use PrintNode</Label>
              </div>

              {printerPrefs.usePrintNode && (
                <div>
                  <Label>PrintNode Printer ID</Label>
                  <Input
                    type="number"
                    value={printerPrefs.printNodeId || ''}
                    onChange={(e) => 
                      setPrinterPrefs(prev => ({ 
                        ...prev, 
                        printNodeId: parseInt(e.target.value) || undefined 
                      }))
                    }
                  />
                </div>
              )}

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
                  <SelectContent>
                    <SelectItem value="gap">Gap</SelectItem>
                    <SelectItem value="blackmark">Blackmark</SelectItem>
                    <SelectItem value="continuous">Continuous</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleSavePrinterConfig}>
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
                  {template.format === 'elements' && template.layout?.elements.map((el, i) => {
                    // Fill with test data for preview
                    let displayText = el.type === 'text' ? el.text : el.type === 'barcode' ? el.data : '';
                    if (el.type === 'text') {
                      if (el.id === 'cardname') displayText = testVars.CARDNAME || el.text;
                      if (el.id === 'condition') displayText = testVars.CONDITION || el.text;
                      if (el.id === 'price') displayText = testVars.PRICE || el.text;
                      if (el.id === 'sku') displayText = testVars.SKU || el.text;
                      if (el.id === 'desc') displayText = `${testVars.CARDNAME} • Set • #001`;
                    }
                    if (el.type === 'barcode') {
                      displayText = testVars.BARCODE || el.data;
                    }

                    return (
                      <div
                        key={i}
                        className="absolute border border-gray-400 bg-gray-100 text-xs p-1"
                        style={{
                          left: `${el.x * previewScale}px`,
                          top: `${el.y * previewScale}px`,
                          width: el.type === 'text' ? `${((el as any).w || 30) * previewScale * 4}px` : 'auto',
                          height: el.type === 'text' ? `${((el as any).h || 30) * previewScale}px` : 'auto',
                          fontSize: `${Math.max(8, (el.type === 'text' ? (el as any).h || 30 : 20) * previewScale * 0.8)}px`
                        }}
                      >
                        {el.type === 'barcode' ? `[${displayText}]` : displayText}
                      </div>
                    );
                  })}
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