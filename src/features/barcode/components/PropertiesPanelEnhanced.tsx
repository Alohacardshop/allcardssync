import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import { 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Settings, 
  Trash2,
  Move,
  Maximize2,
  Type,
  AlertTriangle
} from 'lucide-react';
import type { LabelField, SampleData } from '../types/labelLayout';
import { FIELD_LABELS } from '../types/labelLayout';
import { calculateOptimalFontSize, dotsToPixels } from '../utils/textFitting';
import { cn } from '@/lib/utils';

interface PropertiesPanelEnhancedProps {
  field: LabelField | null;
  onUpdateField: (fieldId: string, updates: Partial<LabelField>) => void;
  onRemoveField: (fieldId: string) => void;
  labelBounds: { width: number; height: number };
  sampleData: SampleData;
}

export const PropertiesPanelEnhanced: React.FC<PropertiesPanelEnhancedProps> = ({
  field,
  onUpdateField,
  onRemoveField,
  labelBounds,
  sampleData,
}) => {
  if (!field) {
    return (
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
            <Settings className="w-3.5 h-3.5" />
            Properties
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <p className="text-xs text-muted-foreground text-center py-6">
            Click a field on the canvas to edit
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleChange = (key: keyof LabelField, value: number | string) => {
    onUpdateField(field.id, { [key]: value });
  };

  // Calculate text fitting preview
  const sampleValue = sampleData[field.fieldKey] || '';
  const scale = 2; // Preview scale
  const { fontSize, lines, isTwoLine } = calculateOptimalFontSize(
    sampleValue,
    dotsToPixels(field.width, scale) - 8,
    dotsToPixels(field.maxFontSize, scale) * 0.6,
    dotsToPixels(field.minFontSize, scale) * 0.6
  );
  
  const actualFontDots = Math.round(fontSize / scale / 0.6);
  const isAtMinSize = actualFontDots <= field.minFontSize + 2;
  const isTruncated = lines.some(l => l.includes('…'));

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium flex items-center gap-1.5">
            <Settings className="w-3.5 h-3.5" />
            {FIELD_LABELS[field.fieldKey]}
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => onRemoveField(field.id)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-3">
        {/* Text preview with fitting info */}
        {field.fieldKey !== 'barcode' && (
          <div className="p-2 bg-muted/50 rounded border">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground">Preview</span>
              <div className="flex items-center gap-1">
                {isTwoLine && (
                  <Badge variant="secondary" className="text-[9px] h-4 px-1">2 lines</Badge>
                )}
                {isAtMinSize && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-400 text-amber-600">
                    <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                    min
                  </Badge>
                )}
              </div>
            </div>
            <div 
              className={cn(
                'text-xs leading-tight truncate',
                field.alignment === 'center' && 'text-center',
                field.alignment === 'right' && 'text-right'
              )}
            >
              {lines.map((line, i) => (
                <div key={i} className="truncate">{line || '\u00A0'}</div>
              ))}
            </div>
            <div className="text-[9px] text-muted-foreground mt-1">
              Font: ~{actualFontDots} dots ({field.minFontSize}–{field.maxFontSize} range)
            </div>
          </div>
        )}

        {/* Position */}
        <div className="space-y-1.5">
          <Label className="text-[10px] font-medium flex items-center gap-1 text-muted-foreground uppercase tracking-wide">
            <Move className="w-3 h-3" />
            Position
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">X</Label>
              <Input
                type="number"
                value={field.x}
                onChange={(e) => handleChange('x', Math.max(0, Math.min(labelBounds.width - field.width, parseInt(e.target.value) || 0)))}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Y</Label>
              <Input
                type="number"
                value={field.y}
                onChange={(e) => handleChange('y', Math.max(0, Math.min(labelBounds.height - field.height, parseInt(e.target.value) || 0)))}
                className="h-7 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Size */}
        <div className="space-y-1.5">
          <Label className="text-[10px] font-medium flex items-center gap-1 text-muted-foreground uppercase tracking-wide">
            <Maximize2 className="w-3 h-3" />
            Size (dots)
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">W</Label>
              <Input
                type="number"
                value={field.width}
                onChange={(e) => handleChange('width', Math.max(20, Math.min(labelBounds.width - field.x, parseInt(e.target.value) || 20)))}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">H</Label>
              <Input
                type="number"
                value={field.height}
                onChange={(e) => handleChange('height', Math.max(16, Math.min(labelBounds.height - field.y, parseInt(e.target.value) || 16)))}
                className="h-7 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Alignment */}
        <div className="space-y-1.5">
          <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Align</Label>
          <ToggleGroup
            type="single"
            value={field.alignment}
            onValueChange={(value) => value && handleChange('alignment', value as 'left' | 'center' | 'right')}
            className="justify-start"
          >
            <ToggleGroupItem value="left" size="sm" className="h-7 w-8">
              <AlignLeft className="w-3.5 h-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="center" size="sm" className="h-7 w-8">
              <AlignCenter className="w-3.5 h-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="right" size="sm" className="h-7 w-8">
              <AlignRight className="w-3.5 h-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Font Sizes */}
        {field.fieldKey !== 'barcode' && (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-medium flex items-center gap-1 text-muted-foreground uppercase tracking-wide">
                  <Type className="w-3 h-3" />
                  Max Font
                </Label>
                <span className="text-[10px] text-muted-foreground font-mono">{field.maxFontSize}</span>
              </div>
              <Slider
                value={[field.maxFontSize]}
                onValueChange={([value]) => handleChange('maxFontSize', Math.max(field.minFontSize, value))}
                min={12}
                max={60}
                step={2}
                className="w-full"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Min Font</Label>
                <span className="text-[10px] text-muted-foreground font-mono">{field.minFontSize}</span>
              </div>
              <Slider
                value={[field.minFontSize]}
                onValueChange={([value]) => handleChange('minFontSize', Math.min(field.maxFontSize, value))}
                min={8}
                max={40}
                step={2}
                className="w-full"
              />
            </div>
          </>
        )}

        {/* Quick size presets */}
        <div className="pt-2 border-t">
          <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Quick Presets</Label>
          <div className="flex flex-wrap gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => {
                onUpdateField(field.id, { width: labelBounds.width - 16, x: 8 });
              }}
            >
              Full Width
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => {
                onUpdateField(field.id, { width: Math.floor((labelBounds.width - 24) / 2) });
              }}
            >
              Half
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => {
                const centerX = Math.floor((labelBounds.width - field.width) / 2);
                onUpdateField(field.id, { x: centerX });
              }}
            >
              Center
            </Button>
          </div>
        </div>

        {/* Info */}
        <div className="pt-2 border-t text-[10px] text-muted-foreground space-y-0.5">
          <p>• Drag to move, corner to resize</p>
          <p>• Font auto-sizes within range</p>
          <p>• Falls back to 2 lines if needed</p>
        </div>
      </CardContent>
    </Card>
  );
};
