import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Clipboard,
} from 'lucide-react';
import { toast } from 'sonner';
import { LabelCanvas } from './LabelCanvas';
import { FieldPalette } from './FieldPalette';
import { PropertiesPanel } from './PropertiesPanel';
import type { LabelLayout, LabelField, FieldKey, SampleData } from '../types/labelLayout';
import { DEFAULT_LABEL_LAYOUT, DEFAULT_SAMPLE_DATA, FIELD_LABELS } from '../types/labelLayout';
import { generateZplFromLayout, generateZplTemplate } from '../utils/layoutToZpl';
import { usePrinter } from '@/hooks/usePrinter';
import { sanitizeLabel } from '@/lib/print/sanitizeZpl';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

interface LabelEditorProps {
  initialLayout?: LabelLayout;
  onSave?: (layout: LabelLayout, zplTemplate: string) => void;
}

export const LabelEditor: React.FC<LabelEditorProps> = ({
  initialLayout,
  onSave,
}) => {
  const [layout, setLayout] = useState<LabelLayout>(initialLayout || DEFAULT_LABEL_LAYOUT);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [scale, setScale] = useState(2.5);
  const [sampleData, setSampleData] = useState<SampleData>(DEFAULT_SAMPLE_DATA);
  const [templateName, setTemplateName] = useState(layout.name);
  const [showZplCode, setShowZplCode] = useState(false);
  
  const { print, isLoading: isPrinting, isConnected } = usePrinter();

  const selectedField = layout.fields.find(f => f.id === selectedFieldId) || null;

  // Generate ZPL for preview
  const generatedZpl = generateZplFromLayout(layout, sampleData);
  const zplTemplate = generateZplTemplate(layout);

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
      condition: { width: 152, height: 50, maxFontSize: 24, minFontSize: 10, alignment: 'center' },
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

      // Save to Supabase
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

      // Check if template exists
      const { data: existing } = await supabase
        .from('label_templates')
        .select('id')
        .eq('id', layout.id)
        .maybeSingle();

      let data;
      let error;

      if (existing) {
        // Update existing
        const result = await supabase
          .from('label_templates')
          .update(payload)
          .eq('id', layout.id)
          .select()
          .single();
        data = result.data;
        error = result.error;
      } else {
        // Insert new
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
      }

      onSave?.(updatedLayout, zplTemplate);
      toast.success('Layout saved successfully');
    } catch (error) {
      console.error('Failed to save layout:', error);
      toast.error('Failed to save layout');
    }
  };

  const handleTestPrint = async () => {
    try {
      const safeZpl = sanitizeLabel(generatedZpl);
      const result = await print(safeZpl, 1);
      
      if (result.success) {
        toast.success('Test print sent to printer');
      } else {
        toast.error(result.error || 'Print failed');
        // Offer clipboard fallback
        toast.info('Tip: Copy ZPL and paste into printer web interface', {
          action: {
            label: 'Copy ZPL',
            onClick: () => {
              navigator.clipboard.writeText(safeZpl);
              toast.success('ZPL copied to clipboard');
            }
          }
        });
      }
    } catch (error) {
      console.error('Print failed:', error);
      toast.error('Print failed - try copying ZPL instead');
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
    toast.success('ZPL file downloaded');
  };

  const handleCopyZpl = () => {
    navigator.clipboard.writeText(showZplCode ? zplTemplate : generatedZpl);
    toast.success('ZPL copied to clipboard');
  };

  const handleResetLayout = () => {
    setLayout({ ...DEFAULT_LABEL_LAYOUT, id: layout.id, name: templateName });
    setSelectedFieldId(null);
    toast.success('Layout reset to default');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 p-4 border-b bg-card">
        <div className="flex items-center gap-3">
          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="w-64 h-9 font-medium"
            placeholder="Template name"
          />
          <Badge variant="outline" className="font-mono text-xs">
            2" × 1" @ 203 DPI
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
            <Edit3 className="w-4 h-4 text-muted-foreground" />
            <Switch
              checked={isPreviewMode}
              onCheckedChange={setIsPreviewMode}
              className="scale-90"
            />
            <Eye className="w-4 h-4 text-muted-foreground" />
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Grid toggle */}
          <Button
            variant={showGrid ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setShowGrid(!showGrid)}
            disabled={isPreviewMode}
          >
            <Grid3X3 className="w-4 h-4" />
          </Button>

          {/* Zoom controls */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setScale(s => Math.max(1.5, s - 0.5))}
            disabled={scale <= 1.5}
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Badge variant="outline" className="font-mono text-xs w-12 justify-center">
            {scale}x
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setScale(s => Math.min(4, s + 0.5))}
            disabled={scale >= 4}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>

          <Separator orientation="vertical" className="h-6" />

          {/* Actions */}
          <Button variant="ghost" size="sm" onClick={handleResetLayout}>
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopyZpl} title="Copy ZPL">
            <Copy className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDownloadZpl} title="Download ZPL">
            <Download className="w-4 h-4" />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleTestPrint}
            disabled={isPrinting}
          >
            <Printer className="w-4 h-4 mr-1" />
            {isPrinting ? 'Printing...' : 'Test Print'}
            {!isConnected && <span className="ml-1 text-amber-500">•</span>}
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Save className="w-4 h-4 mr-1" />
            Save
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Field palette */}
        <div className="w-64 border-r bg-card overflow-y-auto p-4">
          <FieldPalette
            layout={layout}
            onToggleField={handleToggleField}
            onAddField={handleAddField}
          />
        </div>

        {/* Center - Canvas */}
        <div className="flex-1 flex flex-col overflow-hidden bg-muted/30">
          <ScrollArea className="flex-1">
            <div className="flex items-center justify-center p-8 min-h-full">
              <LabelCanvas
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
            <div className="border-t p-4 bg-card">
              <div className="flex items-center gap-2 mb-3">
                <Label className="text-sm font-medium">Sample Data</Label>
                <Badge variant="secondary" className="text-xs">Preview Mode</Badge>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                {(Object.keys(sampleData) as Array<keyof SampleData>).map((key) => (
                  <div key={key}>
                    <Label className="text-xs text-muted-foreground capitalize">{key}</Label>
                    <Input
                      value={sampleData[key]}
                      onChange={(e) => setSampleData(prev => ({ ...prev, [key]: e.target.value }))}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar - Properties */}
        <div className="w-72 border-l bg-card overflow-y-auto p-4 space-y-4">
          <PropertiesPanel
            field={selectedField}
            onUpdateField={handleUpdateField}
            onRemoveField={handleRemoveField}
            labelBounds={{ width: layout.widthDots, height: layout.heightDots }}
          />

          {/* ZPL Preview */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Code className="w-4 h-4" />
                  ZPL Code
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowZplCode(!showZplCode)}
                  className="h-6 text-xs"
                >
                  {showZplCode ? 'Template' : 'Preview'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40 font-mono">
                {showZplCode ? zplTemplate : generatedZpl}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
