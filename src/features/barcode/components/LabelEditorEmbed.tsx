import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Save,
  Download,
  Eye,
  Edit3,
  Grid3X3,
  Printer,
  RotateCcw,
  Code,
  Copy,
  ChevronDown,
  ChevronUp,
  Trash2,
  Star,
  Plus,
  Maximize2,
  Minimize2,
  Layers,
  X,
  Settings2,
  MoveVertical,
  MoveHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { LabelCanvasEnhanced } from './LabelCanvasEnhanced';
import { FieldPalette } from './FieldPalette';
import { PropertiesPanelEnhanced } from './PropertiesPanelEnhanced';
import type { LabelLayout, LabelField, FieldKey, SampleData } from '../types/labelLayout';
import { DEFAULT_LABEL_LAYOUT, DEFAULT_SAMPLE_DATA, FIELD_LABELS } from '../types/labelLayout';
import { generateZplFromLayout, generateZplTemplate } from '../utils/layoutToZpl';
import { usePrinter } from '@/hooks/usePrinter';
import { sanitizeLabel } from '@/lib/print/sanitizeZpl';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

interface SavedTemplate {
  id: string;
  name: string;
  is_default: boolean;
  layout: LabelLayout;
  updated_at: string;
}

export const LabelEditorEmbed: React.FC = () => {
  const [layout, setLayout] = useState<LabelLayout>(DEFAULT_LABEL_LAYOUT);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [scale, setScale] = useState(2);
  const [sampleData, setSampleData] = useState<SampleData>(DEFAULT_SAMPLE_DATA);
  const [templateName, setTemplateName] = useState(layout.name);
  const [showZplCode, setShowZplCode] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFieldPalette, setShowFieldPalette] = useState(false);
  
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const { print, isLoading: isPrinting, isConnected } = usePrinter();

  const selectedField = layout.fields.find(f => f.id === selectedFieldId) || null;

  // Generate ZPL for preview
  const generatedZpl = generateZplFromLayout(layout, sampleData);
  const zplTemplate = generateZplTemplate(layout);

  // Auto-fit scale based on container width
  useEffect(() => {
    const calculateScale = () => {
      if (!canvasContainerRef.current) return;
      const containerWidth = canvasContainerRef.current.clientWidth - 48; // padding
      const containerHeight = canvasContainerRef.current.clientHeight - 48;
      
      const maxScaleW = containerWidth / layout.widthDots;
      const maxScaleH = containerHeight / layout.heightDots;
      const optimalScale = Math.min(maxScaleW, maxScaleH, 2.5);
      
      setScale(Math.max(1.5, Math.min(2.5, optimalScale)));
    };

    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, [layout.widthDots, layout.heightDots, isFullscreen]);

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('label_templates')
        .select('*')
        .eq('template_type', 'raw')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const templates: SavedTemplate[] = (data || [])
        .filter(t => (t.canvas as any)?.layout)
        .map(t => ({
          id: t.id,
          name: t.name,
          is_default: t.is_default || false,
          layout: (t.canvas as any).layout as LabelLayout,
          updated_at: t.updated_at,
        }));

      setSavedTemplates(templates);

      const defaultTemplate = templates.find(t => t.is_default);
      if (defaultTemplate) {
        setLayout(defaultTemplate.layout);
        setTemplateName(defaultTemplate.name);
        setSelectedTemplateId(defaultTemplate.id);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadTemplate = (templateId: string) => {
    const template = savedTemplates.find(t => t.id === templateId);
    if (template) {
      setLayout({ ...template.layout, id: template.id });
      setTemplateName(template.name);
      setSelectedTemplateId(templateId);
      setSelectedFieldId(null);
      toast.success('Template loaded');
    }
  };

  const handleUpdateField = useCallback((fieldId: string, updates: Partial<LabelField>) => {
    setLayout(prev => ({
      ...prev,
      fields: prev.fields.map(f =>
        f.id === fieldId ? { ...f, ...updates } : f
      ),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const handleToggleField = useCallback((fieldKey: FieldKey, enabled: boolean) => {
    setLayout(prev => ({
      ...prev,
      fields: prev.fields.map(f =>
        f.fieldKey === fieldKey ? { ...f, enabled } : f
      ),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const handleAddField = useCallback((fieldKey: FieldKey) => {
    const defaultConfigs: Record<FieldKey, Partial<LabelField>> = {
      title: { width: 260, height: 40, maxFontSize: 28, minFontSize: 14, alignment: 'left' },
      sku: { width: 150, height: 24, maxFontSize: 18, minFontSize: 12, alignment: 'left' },
      price: { width: 118, height: 45, maxFontSize: 36, minFontSize: 20, alignment: 'right' },
      condition: { width: 60, height: 28, maxFontSize: 22, minFontSize: 14, alignment: 'center' },
      barcode: { width: 260, height: 70, maxFontSize: 50, minFontSize: 30, alignment: 'center' },
      set: { width: 150, height: 24, maxFontSize: 16, minFontSize: 10, alignment: 'left' },
      cardNumber: { width: 80, height: 24, maxFontSize: 16, minFontSize: 10, alignment: 'left' },
      year: { width: 60, height: 20, maxFontSize: 14, minFontSize: 10, alignment: 'left' },
      vendor: { width: 120, height: 20, maxFontSize: 14, minFontSize: 10, alignment: 'left' },
    };

    const config = defaultConfigs[fieldKey];
    const newField: LabelField = {
      id: `field-${fieldKey}-${Date.now()}`,
      fieldKey,
      x: 8,
      y: 100,
      width: config.width || 100,
      height: config.height || 30,
      alignment: config.alignment || 'left',
      maxFontSize: config.maxFontSize || 24,
      minFontSize: config.minFontSize || 12,
      enabled: true,
    };

    setLayout(prev => ({
      ...prev,
      fields: [...prev.fields, newField],
      updatedAt: new Date().toISOString(),
    }));
    setSelectedFieldId(newField.id);
    setShowFieldPalette(false);
  }, []);

  const handleRemoveField = useCallback((fieldId: string) => {
    setLayout(prev => ({
      ...prev,
      fields: prev.fields.filter(f => f.id !== fieldId),
      updatedAt: new Date().toISOString(),
    }));
    if (selectedFieldId === fieldId) {
      setSelectedFieldId(null);
    }
  }, [selectedFieldId]);

  const handleSave = async () => {
    try {
      const updatedLayout = {
        ...layout,
        name: templateName,
        updatedAt: new Date().toISOString(),
      };

      const payload = {
        name: templateName,
        template_type: 'raw',
        canvas: {
          zplLabel: zplTemplate,
          layout: JSON.parse(JSON.stringify(updatedLayout)),
          description: `Visual layout: ${layout.fields.filter(f => f.enabled).map(f => FIELD_LABELS[f.fieldKey]).join(', ')}`,
        } as Json,
        is_default: false,
      };

      const { data: existing } = await supabase
        .from('label_templates')
        .select('id')
        .eq('id', layout.id)
        .maybeSingle();

      let data;
      let error;

      if (existing) {
        const result = await supabase
          .from('label_templates')
          .update(payload)
          .eq('id', layout.id)
          .select()
          .single();
        data = result.data;
        error = result.error;
      } else {
        const result = await supabase
          .from('label_templates')
          .insert({ ...payload })
          .select()
          .single();
        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      if (data) {
        setLayout(prev => ({ ...prev, id: data.id }));
        setSelectedTemplateId(data.id);
      }

      await loadTemplates();
      toast.success('Layout saved');
    } catch (error) {
      console.error('Failed to save layout:', error);
      toast.error('Failed to save layout');
    }
  };

  const handleSaveAsNew = async () => {
    const newName = `${templateName} (Copy)`;
    setTemplateName(newName);
    
    const payload = {
      name: newName,
      template_type: 'raw',
      canvas: {
        zplLabel: zplTemplate,
        layout: JSON.parse(JSON.stringify({ ...layout, name: newName, id: `new-${Date.now()}` })),
        description: `Visual layout: ${layout.fields.filter(f => f.enabled).map(f => FIELD_LABELS[f.fieldKey]).join(', ')}`,
      } as Json,
      is_default: false,
    };

    try {
      const { data, error } = await supabase
        .from('label_templates')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setLayout(prev => ({ ...prev, id: data.id }));
        setSelectedTemplateId(data.id);
      }

      await loadTemplates();
      toast.success('New template created');
    } catch (error) {
      console.error('Failed to create template:', error);
      toast.error('Failed to create template');
    }
  };

  const handleSetDefault = async () => {
    if (!selectedTemplateId) return;

    try {
      await supabase
        .from('label_templates')
        .update({ is_default: false })
        .eq('template_type', 'raw');

      const { error } = await supabase
        .from('label_templates')
        .update({ is_default: true })
        .eq('id', selectedTemplateId);

      if (error) throw error;

      await loadTemplates();
      toast.success('Set as default');
    } catch (error) {
      console.error('Failed to set default:', error);
      toast.error('Failed to set default');
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplateId) return;
    if (!confirm('Delete this template?')) return;

    try {
      const { error } = await supabase
        .from('label_templates')
        .delete()
        .eq('id', selectedTemplateId);

      if (error) throw error;

      setSelectedTemplateId('');
      setLayout({ ...DEFAULT_LABEL_LAYOUT, id: `new-${Date.now()}` });
      setTemplateName('New Template');
      await loadTemplates();
      toast.success('Template deleted');
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error('Failed to delete');
    }
  };

  const handleTestPrint = async () => {
    try {
      const safeZpl = sanitizeLabel(generatedZpl);
      const result = await print(safeZpl, 1);
      
      if (result.success) {
        toast.success('Test print sent');
      } else {
        toast.error(result.error || 'Print failed');
      }
    } catch (error) {
      console.error('Print failed:', error);
      toast.error('Print failed');
    }
  };

  const handleDownloadZpl = () => {
    const blob = new Blob([generatedZpl], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${templateName || 'label'}.zpl`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded');
  };

  const handleCopyZpl = () => {
    navigator.clipboard.writeText(showZplCode ? zplTemplate : generatedZpl);
    toast.success('Copied');
  };

  const handleResetLayout = () => {
    setLayout({ ...DEFAULT_LABEL_LAYOUT, id: layout.id, name: templateName });
    setSelectedFieldId(null);
    toast.success('Reset to default');
  };

  const handleNewTemplate = () => {
    setLayout({ ...DEFAULT_LABEL_LAYOUT, id: `new-${Date.now()}` });
    setTemplateName('New Template');
    setSelectedTemplateId('');
    setSelectedFieldId(null);
  };

  const currentIsDefault = savedTemplates.find(t => t.id === selectedTemplateId)?.is_default;
  const enabledFieldsCount = layout.fields.filter(f => f.enabled).length;

  return (
    <div className={`flex flex-col border rounded-lg bg-card overflow-hidden transition-all duration-200 ${
      isFullscreen 
        ? 'fixed inset-2 z-50' 
        : 'h-[500px]'
    }`}>
      {/* Fullscreen backdrop */}
      {isFullscreen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm -z-10" onClick={() => setIsFullscreen(false)} />
      )}

      {/* Compact Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
        {/* Left: Template & Name */}
        <div className="flex items-center gap-2 min-w-0">
          <Select value={selectedTemplateId} onValueChange={handleLoadTemplate}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Template..." />
            </SelectTrigger>
            <SelectContent>
              {savedTemplates.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex items-center gap-1.5">
                    {t.is_default && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                    <span className="truncate">{t.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="w-[120px] h-8 text-xs hidden sm:block"
            placeholder="Name..."
          />

          <div className="hidden md:flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewTemplate} title="New">
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7" 
              onClick={handleSetDefault}
              disabled={!selectedTemplateId || currentIsDefault}
              title="Set default"
            >
              <Star className={`w-3.5 h-3.5 ${currentIsDefault ? 'fill-amber-500 text-amber-500' : ''}`} />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 text-destructive hover:text-destructive" 
              onClick={handleDeleteTemplate}
              disabled={!selectedTemplateId}
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Center: Mode & Grid */}
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 px-2 py-1 rounded bg-background border text-xs">
            <Edit3 className={`w-3 h-3 ${!isPreviewMode ? 'text-primary' : 'text-muted-foreground'}`} />
            <Switch
              checked={isPreviewMode}
              onCheckedChange={setIsPreviewMode}
              className="scale-75"
            />
            <Eye className={`w-3 h-3 ${isPreviewMode ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>

          <Button
            variant={showGrid ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowGrid(!showGrid)}
            disabled={isPreviewMode}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
          </Button>

          <Badge variant="outline" className="font-mono text-[10px] hidden sm:flex">
            {scale.toFixed(1)}x
          </Badge>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 hidden sm:flex" onClick={handleResetLayout} title="Reset">
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 hidden sm:flex" onClick={handleCopyZpl} title="Copy ZPL">
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 hidden sm:flex" onClick={handleDownloadZpl} title="Download">
            <Download className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>

          <Button 
            variant="outline" 
            size="sm"
            className="h-7 text-xs"
            onClick={handleTestPrint}
            disabled={isPrinting}
          >
            <Printer className="w-3.5 h-3.5 mr-1" />
            Print
            {!isConnected && <span className="ml-1 text-amber-500">•</span>}
          </Button>

          <Button size="sm" className="h-7 text-xs" onClick={handleSave}>
            <Save className="w-3.5 h-3.5 mr-1" />
            Save
          </Button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div ref={canvasContainerRef} className="flex-1 relative overflow-hidden bg-muted/10">
        {/* Canvas */}
        <ScrollArea className="h-full">
          <div 
            className="flex items-center justify-center p-6 min-h-full"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setSelectedFieldId(null);
              }
            }}
          >
            <LabelCanvasEnhanced
              layout={layout}
              scale={scale}
              selectedFieldId={selectedFieldId}
              onSelectField={setSelectedFieldId}
              onUpdateField={handleUpdateField}
              sampleData={sampleData}
              isPreviewMode={isPreviewMode}
              showGrid={showGrid}
            />
          </div>
        </ScrollArea>

        {/* Floating Field Palette */}
        <div className="absolute top-3 left-3 z-10 space-y-2">
          <Collapsible open={showFieldPalette} onOpenChange={setShowFieldPalette}>
            <Card className="shadow-lg border-2 w-[180px]">
              <CollapsibleTrigger asChild>
                <CardHeader className="py-2 px-3 cursor-pointer hover:bg-muted/50">
                  <CardTitle className="text-xs font-medium flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />
                      Fields
                      <Badge variant="secondary" className="text-[10px] h-4 px-1">{enabledFieldsCount}</Badge>
                    </span>
                    {showFieldPalette ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-2 pt-0">
                  <FieldPalette
                    layout={layout}
                    onToggleField={handleToggleField}
                    onAddField={handleAddField}
                  />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Label Offset Settings */}
          <Card className="shadow-lg border-2 w-[180px]">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5" />
                Label Offset
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 space-y-2">
              <div className="flex items-center gap-2">
                <MoveVertical className="w-3.5 h-3.5 text-muted-foreground" />
                <Label className="text-[10px] w-8">Top</Label>
                <Input
                  type="number"
                  value={layout.labelTopOffset || 0}
                  onChange={(e) => setLayout(prev => ({ ...prev, labelTopOffset: parseInt(e.target.value) || 0 }))}
                  className="h-6 text-xs w-16"
                  min={-120}
                  max={120}
                />
                <span className="text-[10px] text-muted-foreground">dots</span>
              </div>
              <div className="flex items-center gap-2">
                <MoveHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                <Label className="text-[10px] w-8">Left</Label>
                <Input
                  type="number"
                  value={layout.labelLeftOffset || 0}
                  onChange={(e) => setLayout(prev => ({ ...prev, labelLeftOffset: parseInt(e.target.value) || 0 }))}
                  className="h-6 text-xs w-16"
                  min={-120}
                  max={120}
                />
                <span className="text-[10px] text-muted-foreground">dots</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Negative = up/left. ~8 dots = 1mm
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Slide-in Properties Panel (only shows when field selected) */}
        {selectedField && !isPreviewMode && (
          <div className="absolute top-3 right-3 bottom-3 z-10 w-[240px] animate-in slide-in-from-right-5 duration-200">
            <Card className="h-full shadow-lg border-2 flex flex-col">
              <CardHeader className="py-2 px-3 flex-row items-center justify-between shrink-0">
                <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5" />
                  Properties
                </CardTitle>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedFieldId(null)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </CardHeader>
              <CardContent className="p-2 pt-0 flex-1 overflow-auto">
                <PropertiesPanelEnhanced
                  field={selectedField}
                  onUpdateField={handleUpdateField}
                  onRemoveField={handleRemoveField}
                  labelBounds={{ width: layout.widthDots, height: layout.heightDots }}
                  sampleData={sampleData}
                />
              </CardContent>
            </Card>
          </div>
        )}

        {/* ZPL Code Floating Panel */}
        <div className="absolute bottom-3 left-3 z-10">
          <Collapsible open={showZplCode} onOpenChange={setShowZplCode}>
            <Card className="shadow-lg w-[300px]">
              <CollapsibleTrigger asChild>
                <CardHeader className="py-2 px-3 cursor-pointer hover:bg-muted/50">
                  <CardTitle className="text-xs font-medium flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Code className="w-3.5 h-3.5" />
                      ZPL Code
                    </span>
                    {showZplCode ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-2 pt-0">
                  <pre className="text-[10px] bg-muted p-2 rounded overflow-auto max-h-32 font-mono leading-tight">
                    {generatedZpl}
                  </pre>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>
      </div>

      {/* Sample Data Editor (Preview Mode) */}
      {isPreviewMode && (
        <div className="border-t p-2 bg-background shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <Label className="text-xs font-medium">Sample Data</Label>
            <Badge variant="secondary" className="text-[10px]">Preview</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {(Object.keys(sampleData) as Array<keyof SampleData>).map((key) => (
              <div key={key}>
                <Label className="text-[10px] text-muted-foreground capitalize">{key}</Label>
                <Input
                  value={sampleData[key]}
                  onChange={(e) => setSampleData(prev => ({ ...prev, [key]: e.target.value }))}
                  className="h-7 text-xs"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
