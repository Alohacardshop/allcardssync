import { abbreviateGrade } from '@/lib/labelData';
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Printer, Save, RotateCcw, Star, Trash2, Settings, Copy, Download } from 'lucide-react';
import { toast } from 'sonner';

import { ZPLVisualEditor } from '@/components/ZPLVisualEditor';
import { ZPLElementEditor } from '@/components/ZPLElementEditor';
import { ZPLPreview } from '@/components/ZPLPreview';
import { useRawTemplates } from '@/hooks/useRawTemplates';
import { useTemplateDefault } from '@/hooks/useTemplateDefault';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useSimplePrinting } from '@/hooks/useSimplePrinting';
import { StockModeSelector } from '@/components/StockModeSelector';
import { StockModeConfig } from '@/lib/printService';
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
  const { print, isLoading: isPrinting, testConnection } = useSimplePrinting();
  
  // Template management
  const {
    templates,
    defaultTemplate,
    saveTemplate,
    setAsDefault,
    deleteTemplate,
    loading: templatesLoading
  } = useRawTemplates();
  
  const { selectedTemplateId } = useTemplateDefault();

  // ZPL Label state - this is the source of truth
  const [label, setLabel] = useState<ZPLLabel>(createDefaultLabelTemplate());
  const [selectedElement, setSelectedElement] = useState<ZPLElement | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  
  // Template name for saving
  const [templateName, setTemplateName] = useState('');
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);
  
  // Print settings with persistent calibration
  const [copies, setCopies] = useState(1);
  const [cutAfter, setCutAfter] = useState(true); // Default to cut after for ZD410
  const [xOffset, setXOffset] = useLocalStorage('printer-x-offset', 0);
  const [yOffset, setYOffset] = useLocalStorage('printer-y-offset', 0);
  const [zplSettings, setZplSettings] = useState({
    darkness: 10,
    speed: 4
  });
  const [stockConfig, setStockConfig] = useLocalStorage<StockModeConfig>('zebra-stock-config', {
    mode: 'gap',
    speed: 4,
    darkness: 10
  });

  // Keep preview ZPL in sync with elements and settings
  const [previewZpl, setPreviewZpl] = useState('');

  // Update preview whenever label or settings change
  useEffect(() => {
    const zpl = generateZPLFromElements(label, xOffset, yOffset);
    setPreviewZpl(zpl);
  }, [label, xOffset, yOffset]);

  // Load default template on component mount and when selectedTemplateId changes
  useEffect(() => {
    if (templatesLoading) return;
    
    console.log('Templates loaded:', templates.length);
    console.log('Selected template ID:', selectedTemplateId);
    console.log('Default template:', defaultTemplate?.name);
    
    // Find the template to load (selected or default)
    let templateToLoad = templates.find(t => t.id === selectedTemplateId);
    if (!templateToLoad && defaultTemplate) {
      templateToLoad = defaultTemplate;
    }
    
    if (templateToLoad) {
      try {
        console.log('Loading template:', templateToLoad.name, 'ID:', templateToLoad.id);
        setCurrentTemplateId(templateToLoad.id);
        setTemplateName(templateToLoad.name);
        
        // Load from ZPL format if available
        if (templateToLoad.canvas?.zplLabel) {
          console.log('Loading from ZPL format:', templateToLoad.canvas.zplLabel);
          const loadedLabel = { ...templateToLoad.canvas.zplLabel };
          
          // Apply condition abbreviation to loaded template
          loadedLabel.elements = loadedLabel.elements.map(element => {
            if (element.id === 'condition' && element.type === 'text') {
              return { ...element, text: abbreviateGrade(element.text) || 'NM' };
            }
            return element;
          });
          
          setLabel(loadedLabel);
        } else if (templateToLoad.canvas && templateToLoad.canvas.labelData) {
          // Fallback: convert old template format to ZPL format
          const convertedLabel = createDefaultLabelTemplate();
          
          // Update elements with template data
          convertedLabel.elements = convertedLabel.elements.map(element => {
            switch (element.id) {
              case 'condition':
                return { ...element, text: abbreviateGrade(templateToLoad.canvas.labelData.condition) || 'NM' };
              case 'price':
                return { ...element, text: `$${templateToLoad.canvas.labelData.price}` || '$15.99' };
              case 'barcode':
                if (element.type === 'barcode') {
                  return { ...element, data: templateToLoad.canvas.labelData.barcode || '120979260' };
                }
                return element;
              case 'title':
                return { ...element, text: templateToLoad.canvas.labelData.title || 'POKEMON GENGAR VMAX #020' };
              default:
                return element;
            }
          });
          
          setLabel(convertedLabel);
        }
        
        if (templateToLoad.canvas?.tsplSettings) {
          setZplSettings({
            darkness: templateToLoad.canvas.tsplSettings.density || 10,
            speed: templateToLoad.canvas.tsplSettings.speed || 4
          });
        }
      } catch (error) {
        console.error('Error loading template:', error);
      }
    }
  }, [templates, selectedTemplateId, defaultTemplate, templatesLoading]);

  // Ensure we always have a default label to work with
  useEffect(() => {
    if (!label.elements || label.elements.length === 0) {
      console.log('No label elements found, creating default template');
      setLabel(createDefaultLabelTemplate());
    }
  }, [label]);

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error('Please enter a template name');
      return;
    }

    console.log('Saving template with data:', {
      name: templateName.trim(),
      label,
      settings: { copies, xOffset, yOffset, darkness: zplSettings.darkness, speed: zplSettings.speed }
    });

    const result = await saveTemplate(
      templateName.trim(),
      {},
      {},
      {},
      currentTemplateId || undefined,
      { zplLabel: label, zplSettings: { copies, xOffset, yOffset, darkness: zplSettings.darkness, speed: zplSettings.speed } }
    );

    if (result) {
      setCurrentTemplateId(result.id);
      console.log('Template saved successfully:', result.id);
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
          const loadedLabel = { ...template.canvas.zplLabel };
          
          // Apply condition abbreviation to loaded template
          loadedLabel.elements = loadedLabel.elements.map(element => {
            if (element.id === 'condition' && element.type === 'text') {
              return { ...element, text: abbreviateGrade(element.text) || 'NM' };
            }
            return element;
          });
          
          setLabel(loadedLabel);
        } else {
          // Convert old format to ZPL
          const convertedLabel = createDefaultLabelTemplate();
          
          if (template.canvas?.labelData) {
            convertedLabel.elements = convertedLabel.elements.map(element => {
              switch (element.id) {
                case 'condition':
                  return { ...element, text: abbreviateGrade(template.canvas.labelData.condition) || 'NM' };
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

  const handlePrintCurrentLabel = async () => {
    try {
      const zplCode = generateZPLFromElements(label, xOffset, yOffset, {
        speed: zplSettings.speed,
        darkness: zplSettings.darkness,
        copies
      });
      console.log('🖨️ Printing current label with unified settings');
      console.log('Generated ZPL:', zplCode);
      
      const result = await print(zplCode, copies);
      if (result.success) {
        toast.success('Label sent to printer successfully');
      } else {
        toast.error(`Print failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Print failed:', error);
      toast.error('Failed to print label');
    }
  };

  const handleCopyZPL = async () => {
    try {
      await navigator.clipboard.writeText(previewZpl);
      toast.success('ZPL code copied to clipboard');
    } catch (error) {
      console.error('Failed to copy ZPL:', error);
      toast.error('Failed to copy ZPL code');
    }
  };

  const handleDownloadZPL = () => {
    try {
      const blob = new Blob([previewZpl], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'label.zpl';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('ZPL file downloaded');
    } catch (error) {
      console.error('Failed to download ZPL:', error);
      toast.error('Failed to download ZPL file');
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
    setCutAfter(true);
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
        {/* Main Editor - Always mounted as source of truth */}
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
                          {currentTemplateId ? 'Update Template' : 'Save New Template'}
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
                      
                      <div className="flex gap-2">
                        <Input
                          id="template-name"
                          value={templateName}
                          onChange={(e) => setTemplateName(e.target.value)}
                          placeholder={currentTemplateId ? "Template name" : "Enter template name"}
                        />
                         <Button 
                           onClick={handleSaveTemplate} 
                           size="sm"
                           disabled={!templateName.trim()}
                         >
                           <Save className="w-4 h-4" />
                           {currentTemplateId ? 'Update' : 'Save'}
                         </Button>
                       </div>
                      <p className="text-xs text-muted-foreground">
                        {currentTemplateId ? 'Update the current template' : 'Save current label as a new template'}
                      </p>
                    </div>
                  </div>
                </TabsContent>

                {/* Print Settings - PrintNode only */}
                <TabsContent value="print" className="space-y-4">
                  <div className="space-y-4">
                    {/* Print Button - Unified */}
                    <div className="space-y-2">
                      <Label>Printing (PrintNode)</Label>
                      <Button 
                        onClick={handlePrintCurrentLabel} 
                        disabled={isPrinting}
                        className="w-full"
                        size="lg"
                      >
                        <Printer className="w-4 h-4 mr-2" />
                        Print Current Label
                      </Button>
                    </div>

                    <Separator />

                    {/* ZPL Actions */}
                    <div className="space-y-2">
                      <Label>ZPL Actions</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button 
                          onClick={handleCopyZPL}
                          variant="outline"
                          size="sm"
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          Copy ZPL
                        </Button>
                        <Button 
                          onClick={handleDownloadZPL}
                          variant="outline"
                          size="sm"
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Download .zpl
                        </Button>
                      </div>
                    </div>

                    <Separator />

                    {/* Print Options */}
                    <div className="space-y-3">
                      <Label>Print Options</Label>
                      
                      <div>
                        <Label htmlFor="copies">Copies</Label>
                        <Input
                          id="copies"
                          type="number"
                          min="1"
                          max="99"
                          value={copies}
                          onChange={(e) => setCopies(Number(e.target.value))}
                          className="mt-1"
                        />
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch 
                          checked={cutAfter} 
                          onCheckedChange={setCutAfter}
                        />
                        <Label>Cut after printing</Label>
                      </div>
                    </div>

                    <Separator />

                    {/* Calibration Offsets */}
                    <div className="space-y-3">
                      <Label>Print Calibration</Label>
                      
                      <div>
                        <Label htmlFor="x-offset">X Offset (dots)</Label>
                        <Input
                          id="x-offset"
                          type="number"
                          value={xOffset}
                          onChange={(e) => setXOffset(Number(e.target.value))}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label htmlFor="y-offset">Y Offset (dots)</Label>
                        <Input
                          id="y-offset"
                          type="number"
                          value={yOffset}
                          onChange={(e) => setYOffset(Number(e.target.value))}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Display Settings */}
                <TabsContent value="settings" className="space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Show Grid</Label>
                      <Switch 
                        checked={showGrid} 
                        onCheckedChange={setShowGrid}
                      />
                    </div>

                    <Separator />

                    <StockModeSelector 
                      config={stockConfig}
                      onChange={setStockConfig}
                    />

                    <StockModeSelector 
                      config={stockConfig}
                      onChange={setStockConfig}
                    />

                    <Separator />

                    <Button 
                      onClick={resetToDefaults} 
                      variant="outline"
                      className="w-full"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset to Defaults
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
