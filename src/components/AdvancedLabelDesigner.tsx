import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Printer, Save, RotateCcw, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ZPLVisualEditor } from '@/components/ZPLVisualEditor';
import { ZPLElementEditor } from '@/components/ZPLElementEditor';
import { ZPLPreview } from '@/components/ZPLPreview';
import { useRawTemplates } from '@/hooks/useRawTemplates';
import { useSimplePrinting } from '@/hooks/useSimplePrinting';
import { 
  ZPLElement, 
  ZPLLabel, 
  createDefaultLabelTemplate,
  generateZPLFromElements
} from '@/lib/zplElements';

interface AdvancedLabelDesignerProps {
  className?: string;
}

export function AdvancedLabelDesigner({ className = "" }: AdvancedLabelDesignerProps) {
  const { print, isLoading: isPrinting } = useSimplePrinting();
  
  // Template management
  const {
    templates,
    defaultTemplate,
    saveTemplate,
    setAsDefault,
    deleteTemplate,
    loading: templatesLoading
  } = useRawTemplates();

  // ZPL Label state
  const [label, setLabel] = useState<ZPLLabel>(createDefaultLabelTemplate());
  const [selectedElement, setSelectedElement] = useState<ZPLElement | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  
  // Template name for saving
  const [templateName, setTemplateName] = useState('');
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);
  
  // Print settings
  const [copies, setCopies] = useState(1);
  const [cutAfter, setCutAfter] = useState(false);
  const [zplSettings, setZplSettings] = useState({
    darkness: 10,
    speed: 4
  });

  // Load default template on component mount
  useEffect(() => {
    if (defaultTemplate && !templatesLoading) {
      try {
        // Convert old template format to ZPL format if needed
        if (defaultTemplate.canvas && defaultTemplate.canvas.labelData) {
          const convertedLabel = createDefaultLabelTemplate();
          
          // Update elements with template data
          convertedLabel.elements = convertedLabel.elements.map(element => {
            switch (element.id) {
              case 'condition':
                return { ...element, text: defaultTemplate.canvas.labelData.condition || 'Near Mint' };
              case 'price':
                return { ...element, text: `$${defaultTemplate.canvas.labelData.price}` || '$15.99' };
              case 'barcode':
                if (element.type === 'barcode') {
                  return { ...element, data: defaultTemplate.canvas.labelData.barcode || '120979260' };
                }
                return element;
              case 'title':
                return { ...element, text: defaultTemplate.canvas.labelData.title || 'POKEMON GENGAR VMAX #020' };
              default:
                return element;
            }
          });
          
          setLabel(convertedLabel);
        }
        
        if (defaultTemplate.canvas?.tsplSettings) {
          setZplSettings({
            darkness: defaultTemplate.canvas.tsplSettings.density || 10,
            speed: defaultTemplate.canvas.tsplSettings.speed || 4
          });
        }
      } catch (error) {
        console.error('Error loading default template:', error);
      }
    }
  }, [defaultTemplate, templatesLoading]);

  // Auto-save when editing an existing template
  useEffect(() => {
    if (!currentTemplateId || !templateName.trim()) return;
    
    const timeoutId = setTimeout(() => {
      handleAutoSave();
    }, 2000); // Auto-save after 2 seconds of inactivity
    
    return () => clearTimeout(timeoutId);
  }, [label, zplSettings, currentTemplateId]);

  const handleAutoSave = async () => {
    if (!currentTemplateId || !templateName.trim()) return;
    
    try {
      const titleElement = label.elements.find(e => e.id === 'title' && e.type === 'text') as any;
      const priceElement = label.elements.find(e => e.id === 'price' && e.type === 'text') as any;
      const conditionElement = label.elements.find(e => e.id === 'condition' && e.type === 'text') as any;
      const barcodeElement = label.elements.find(e => e.id === 'barcode' && e.type === 'barcode') as any;
      
      const templateData = {
        fieldConfig: {
          includeTitle: true,
          includeSku: true,
          includePrice: true,
          includeLot: false,
          includeCondition: true,
          barcodeMode: 'barcode' as const
        },
        labelData: {
          title: titleElement?.text || 'POKEMON GENGAR VMAX #020',
          sku: barcodeElement?.data || '120979260',
          price: priceElement?.text?.replace('$', '') || '15.99',
          lot: 'LOT-000001',
          condition: conditionElement?.text || 'Near Mint',
          barcode: barcodeElement?.data || '120979260'
        },
        tsplSettings: { 
          density: zplSettings.darkness, 
          speed: zplSettings.speed, 
          gapInches: 0
        },
        zplLabel: label,
        zplSettings: zplSettings
      };

      await saveTemplate(
        templateName,
        templateData.fieldConfig,
        templateData.labelData,
        templateData,
        currentTemplateId // Pass template ID for update
      );
      
      console.log('Auto-saved template:', templateName);
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error('Please enter a template name');
      return;
    }

    console.log('Attempting to save ZPL template:', templateName);
    console.log('Label:', label);
    console.log('ZPL settings:', zplSettings);

    try {
      // Save the ZPL structure to preserve exact layout and positioning
      const titleElement = label.elements.find(e => e.id === 'title' && e.type === 'text') as any;
      const priceElement = label.elements.find(e => e.id === 'price' && e.type === 'text') as any;
      const conditionElement = label.elements.find(e => e.id === 'condition' && e.type === 'text') as any;
      const barcodeElement = label.elements.find(e => e.id === 'barcode' && e.type === 'barcode') as any;
      
      const templateData = {
        fieldConfig: {
          includeTitle: true,
          includeSku: true,
          includePrice: true,
          includeLot: false,
          includeCondition: true,
          barcodeMode: 'barcode' as const
        },
        labelData: {
          title: titleElement?.text || 'POKEMON GENGAR VMAX #020',
          sku: barcodeElement?.data || '120979260',
          price: priceElement?.text?.replace('$', '') || '15.99',
          lot: 'LOT-000001',
          condition: conditionElement?.text || 'Near Mint',
          barcode: barcodeElement?.data || '120979260'
        },
        tsplSettings: { 
          density: zplSettings.darkness, 
          speed: zplSettings.speed, 
          gapInches: 0
        },
        zplLabel: label, // Preserve the complete ZPL structure
        zplSettings: zplSettings // Preserve ZPL settings
      };

      const result = await saveTemplate(
        templateName,
        templateData.fieldConfig,
        templateData.labelData,
        templateData // Pass the entire templateData as the canvas object
      );

      console.log('Save template result:', result);

      if (result) {
        toast.success('Template saved successfully');
        setTemplateName('');
        setCurrentTemplateId(null); // Clear current template after saving new one
      } else {
        toast.error('Failed to save template - no result returned');
      }
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save template');
    }
  };

  const handleLoadTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setCurrentTemplateId(templateId); // Track which template we're editing
      setTemplateName(template.name); // Set template name for display
      
      try {
        // Check if template has ZPL data
        if (template.canvas?.zplLabel) {
          setLabel(template.canvas.zplLabel);
        } else {
          // Convert old format to ZPL
          const convertedLabel = createDefaultLabelTemplate();
          
          if (template.canvas?.labelData) {
            convertedLabel.elements = convertedLabel.elements.map(element => {
              switch (element.id) {
                case 'condition':
                  return { ...element, text: template.canvas.labelData.condition || 'Near Mint' };
                case 'price':
                  return { ...element, text: `$${template.canvas.labelData.price}` || '$15.99' };
                case 'barcode':
                  if (element.type === 'barcode') {
                    return { ...element, data: template.canvas.labelData.barcode || '120979260' };
                  }
                  return element;
                case 'title':
                  return { ...element, text: template.canvas.labelData.title || 'POKEMON GENGAR VMAX #020' };
                default:
                  return element;
              }
            });
          }
          
          setLabel(convertedLabel);
        }
        
        if (template.canvas?.tsplSettings) {
          setZplSettings({
            darkness: template.canvas.tsplSettings.density || 10,
            speed: template.canvas.tsplSettings.speed || 4
          });
        }
        
        toast.success(`Loaded template: ${template.name}`);
      } catch (error) {
        console.error('Error loading template:', error);
        toast.error('Failed to load template');
      }
    }
  };

  const handlePrint = async () => {
    try {
      const zplCode = generateZPLFromElements(label);
      console.log('Generated ZPL for printing:', zplCode);
      
      await print(zplCode, copies);
      toast.success('Label sent to printer');
    } catch (error) {
      console.error('Print failed:', error);
      toast.error('Failed to print label');
    }
  };

  const resetToDefaults = () => {
    setLabel(createDefaultLabelTemplate());
    setSelectedElement(null);
    setZplSettings({
      darkness: 10,
      speed: 4
    });
    setCopies(1);
    setCutAfter(false);
    toast.success('Reset to defaults');
  };

  const handleElementUpdate = (updatedElement: ZPLElement) => {
    setLabel(prev => ({
      ...prev,
      elements: prev.elements.map(el => 
        el.id === updatedElement.id ? updatedElement : el
      )
    }));
    setSelectedElement(updatedElement);
  };

  const handleElementDelete = (elementId: string) => {
    setLabel(prev => ({
      ...prev,
      elements: prev.elements.filter(el => el.id !== elementId)
    }));
    if (selectedElement?.id === elementId) {
      setSelectedElement(null);
    }
    toast.success('Element deleted');
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main Editor */}
        <div className="xl:col-span-2 space-y-4">
          <ZPLVisualEditor
            label={label}
            onLabelChange={setLabel}
            selectedElement={selectedElement}
            onElementSelect={setSelectedElement}
            showGrid={showGrid}
            onToggleGrid={() => setShowGrid(!showGrid)}
          />
          
          <ZPLPreview label={label} />
        </div>

        {/* Right Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Label Designer</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="element" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="element">Element</TabsTrigger>
                  <TabsTrigger value="template">Templates</TabsTrigger>
                  <TabsTrigger value="print">Print</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>

                {/* Element Editor */}
                <TabsContent value="element" className="space-y-4">
                  <ZPLElementEditor
                    element={selectedElement}
                    onUpdate={handleElementUpdate}
                    onDelete={handleElementDelete}
                  />
                </TabsContent>

                {/* Template Management */}
                <TabsContent value="template" className="space-y-4">
                  <div className="space-y-4">
                    {/* Saved Templates List */}
                    <div className="space-y-2">
                      <Label>Saved Templates</Label>
                      {templatesLoading ? (
                        <div className="text-sm text-muted-foreground">Loading templates...</div>
                      ) : templates.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No templates saved yet</div>
                      ) : (
                        <div className="space-y-2">
                          {templates.map((template) => (
                            <div key={template.id} className="flex items-center justify-between p-2 border rounded-lg">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{template.name}</span>
                                {template.is_default && (
                                  <Badge variant="secondary" className="text-xs">Default</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleLoadTemplate(template.id)}
                                  className="h-8 px-2"
                                >
                                  Load
                                </Button>
                                {!template.is_default && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => setAsDefault(template.id)}
                                    className="h-8 px-2"
                                  >
                                    <Star className="w-3 h-3" />
                                  </Button>
                                )}
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => deleteTemplate(template.id)}
                                  className="h-8 px-2 text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="template-name">
                          {currentTemplateId ? 'Editing Template' : 'Save New Template'}
                        </Label>
                        {currentTemplateId && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              setCurrentTemplateId(null);
                              setTemplateName('');
                              toast.info('Started new template');
                            }}
                          >
                            New Template
                          </Button>
                        )}
                      </div>
                      
                      {currentTemplateId && (
                        <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
                          Auto-saving changes to "{templateName}"
                        </div>
                      )}
                      
                      <div className="flex gap-2">
                        <Input
                          id="template-name"
                          value={templateName}
                          onChange={(e) => setTemplateName(e.target.value)}
                          placeholder={currentTemplateId ? "Current template name" : "Enter template name"}
                          disabled={!!currentTemplateId}
                         />
                         {!currentTemplateId && (
                           <Button 
                             onClick={handleSaveTemplate} 
                             size="sm"
                             disabled={!templateName.trim()}
                           >
                             <Save className="w-4 h-4" />
                           </Button>
                         )}
                       </div>
                      <p className="text-xs text-muted-foreground">
                        This will save your current label design and print settings
                      </p>
                    </div>

                    {defaultTemplate && (
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Star className="w-4 h-4 fill-current" />
                          <span className="text-sm font-medium">Default Template</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {defaultTemplate.name}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleLoadTemplate(defaultTemplate.id)}
                          className="mt-2 h-8"
                        >
                          Load Default
                        </Button>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Print Settings */}
                <TabsContent value="print" className="space-y-4">
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Print Settings</h4>
                    
                    <div className="space-y-2">
                      <Label htmlFor="copies">Copies</Label>
                      <Input
                        id="copies"
                        type="number"
                        min="1"
                        max="99"
                        value={copies}
                        onChange={(e) => setCopies(Number(e.target.value))}
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch 
                        id="cut-after"
                        checked={cutAfter} 
                        onCheckedChange={setCutAfter} 
                      />
                      <Label htmlFor="cut-after">Cut after printing</Label>
                    </div>

                    <Separator />

                    <h4 className="text-sm font-medium">ZPL Settings</h4>

                    <div className="space-y-2">
                      <Label htmlFor="darkness">Darkness (0-30)</Label>
                      <Input
                        id="darkness"
                        type="number"
                        min="0"
                        max="30"
                        value={zplSettings.darkness}
                        onChange={(e) => setZplSettings(prev => ({
                          ...prev,
                          darkness: Number(e.target.value)
                        }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="speed">Print Speed (1-14)</Label>
                      <Input
                        id="speed"
                        type="number"
                        min="1"
                        max="14"
                        value={zplSettings.speed}
                        onChange={(e) => setZplSettings(prev => ({
                          ...prev,
                          speed: Number(e.target.value)
                        }))}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* Settings */}
                <TabsContent value="settings" className="space-y-4">
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Display Settings</h4>
                    
                    <div className="flex items-center space-x-2">
                      <Switch 
                        id="show-grid"
                        checked={showGrid} 
                        onCheckedChange={setShowGrid} 
                      />
                      <Label htmlFor="show-grid">Show grid</Label>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label>Label Information</Label>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div>Size: 2" × 1" (406 × 203 dots)</div>
                        <div>DPI: 203</div>
                        <div>Elements: {label.elements.length}</div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button 
              onClick={handlePrint} 
              disabled={isPrinting}
              className="flex-1"
            >
              <Printer className="w-4 h-4 mr-2" />
              {isPrinting ? 'Printing...' : 'Print Label'}
            </Button>
            <Button 
              onClick={resetToDefaults}
              variant="outline"
              size="icon"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}