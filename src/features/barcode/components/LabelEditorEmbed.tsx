import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Code,
  Copy,
  ChevronDown,
  Trash2,
  Star,
  Plus,
  FolderOpen,
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
  const [scale, setScale] = useState(3);
  const [sampleData, setSampleData] = useState<SampleData>(DEFAULT_SAMPLE_DATA);
  const [templateName, setTemplateName] = useState(layout.name);
  const [showZplCode, setShowZplCode] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  
  const { print, isLoading: isPrinting, isConnected } = usePrinter();

  const selectedField = layout.fields.find(f => f.id === selectedFieldId) || null;

  // Generate ZPL for preview
  const generatedZpl = generateZplFromLayout(layout, sampleData);
  const zplTemplate = generateZplTemplate(layout);

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
        .filter(t => (t.canvas as any)?.layout) // Only visual layouts
        .map(t => ({
          id: t.id,
          name: t.name,
          is_default: t.is_default || false,
          layout: (t.canvas as any).layout as LabelLayout,
          updated_at: t.updated_at,
        }));

      setSavedTemplates(templates);

      // Auto-load default template
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

  return (
    <div className="flex flex-col h-[calc(100vh-280px)] min-h-[600px] border rounded-lg bg-card overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          {/* Template selector */}
          <Select value={selectedTemplateId} onValueChange={handleLoadTemplate}>
            <SelectTrigger className="w-48 h-8">
              <SelectValue placeholder="Select template..." />
            </SelectTrigger>
            <SelectContent>
              {savedTemplates.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex items-center gap-2">
                    {t.name}
                    {t.is_default && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="ghost" size="sm" onClick={handleNewTemplate} title="New template">
            <Plus className="w-4 h-4" />
          </Button>

          <Separator orientation="vertical" className="h-6" />

          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="w-48 h-8 text-sm"
            placeholder="Template name"
          />

          <Badge variant="outline" className="font-mono text-xs whitespace-nowrap">
            2" × 1"
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Mode toggle */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-background border">
            <Edit3 className={`w-3.5 h-3.5 ${!isPreviewMode ? 'text-primary' : 'text-muted-foreground'}`} />
            <Switch
              checked={isPreviewMode}
              onCheckedChange={setIsPreviewMode}
              className="scale-75"
            />
            <Eye className={`w-3.5 h-3.5 ${isPreviewMode ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>

          <Button
            variant={showGrid ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setShowGrid(!showGrid)}
            disabled={isPreviewMode}
            className="h-8 w-8 p-0"
          >
            <Grid3X3 className="w-4 h-4" />
          </Button>

          {/* Zoom */}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setScale(s => Math.max(2, s - 0.5))}
              disabled={scale <= 2}
              className="h-8 w-8 p-0"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Badge variant="outline" className="font-mono text-xs w-10 justify-center">
              {scale}x
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setScale(s => Math.min(4, s + 0.5))}
              disabled={scale >= 4}
              className="h-8 w-8 p-0"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>

          <Separator orientation="vertical" className="h-6" />

          <Button variant="ghost" size="sm" onClick={handleResetLayout} className="h-8 w-8 p-0" title="Reset">
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopyZpl} className="h-8 w-8 p-0" title="Copy ZPL">
            <Copy className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDownloadZpl} className="h-8 w-8 p-0" title="Download">
            <Download className="w-4 h-4" />
          </Button>

          <Separator orientation="vertical" className="h-6" />

          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleTestPrint}
            disabled={isPrinting}
            className="h-8"
          >
            <Printer className="w-4 h-4 mr-1" />
            Print
            {!isConnected && <span className="ml-1 text-amber-500">•</span>}
          </Button>

          <Button size="sm" onClick={handleSave} className="h-8">
            <Save className="w-4 h-4 mr-1" />
            Save
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Field palette */}
        <div className="w-56 border-r bg-muted/20 overflow-y-auto p-3">
          <FieldPalette
            layout={layout}
            onToggleField={handleToggleField}
            onAddField={handleAddField}
          />

          {/* Template actions */}
          <Card className="mt-4">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs font-medium text-muted-foreground">Template Actions</CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 space-y-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveAsNew}
                className="w-full justify-start h-7 text-xs"
              >
                <Plus className="w-3 h-3 mr-1.5" />
                Save as New
              </Button>
              {selectedTemplateId && (
                <>
                  <Button
                    variant={currentIsDefault ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={handleSetDefault}
                    className="w-full justify-start h-7 text-xs"
                    disabled={currentIsDefault}
                  >
                    <Star className={`w-3 h-3 mr-1.5 ${currentIsDefault ? 'fill-current' : ''}`} />
                    {currentIsDefault ? 'Default' : 'Set Default'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDeleteTemplate}
                    className="w-full justify-start h-7 text-xs text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3 mr-1.5" />
                    Delete
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Center - Canvas */}
        <div className="flex-1 flex flex-col overflow-hidden bg-muted/10">
          <ScrollArea className="flex-1">
            <div className="flex items-center justify-center p-6 min-h-full">
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

          {/* Sample data editor */}
          {isPreviewMode && (
            <div className="border-t p-3 bg-background">
              <div className="flex items-center gap-2 mb-2">
                <Label className="text-xs font-medium">Sample Data</Label>
                <Badge variant="secondary" className="text-[10px]">Preview</Badge>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
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

        {/* Right sidebar - Properties */}
        <div className="w-64 border-l bg-muted/20 overflow-y-auto p-3 space-y-3">
          <PropertiesPanelEnhanced
            field={selectedField}
            onUpdateField={handleUpdateField}
            onRemoveField={handleRemoveField}
            labelBounds={{ width: layout.widthDots, height: layout.heightDots }}
            sampleData={sampleData}
          />

          {/* ZPL Preview - Collapsible */}
          <Collapsible open={showZplCode} onOpenChange={setShowZplCode}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="py-2 px-3 cursor-pointer hover:bg-muted/50">
                  <CardTitle className="text-xs font-medium flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Code className="w-3.5 h-3.5" />
                      ZPL Code
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showZplCode ? 'rotate-180' : ''}`} />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="px-3 pb-3 pt-0">
                  <pre className="text-[10px] bg-muted p-2 rounded overflow-auto max-h-32 font-mono leading-tight">
                    {generatedZpl}
                  </pre>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>
      </div>
    </div>
  );
};
