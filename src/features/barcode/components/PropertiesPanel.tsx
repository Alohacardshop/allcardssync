import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Settings, 
  Trash2,
  Move,
  Maximize2
} from 'lucide-react';
import type { LabelField, FieldKey } from '../types/labelLayout';
import { FIELD_LABELS } from '../types/labelLayout';

interface PropertiesPanelProps {
  field: LabelField | null;
  onUpdateField: (fieldId: string, updates: Partial<LabelField>) => void;
  onRemoveField: (fieldId: string) => void;
  labelBounds: { width: number; height: number };
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  field,
  onUpdateField,
  onRemoveField,
  labelBounds,
}) => {
  if (!field) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Properties
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Select a field on the canvas to edit its properties
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleChange = (key: keyof LabelField, value: number | string) => {
    onUpdateField(field.id, { [key]: value });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Settings className="w-4 h-4" />
            {FIELD_LABELS[field.fieldKey]} Properties
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-destructive hover:text-destructive"
            onClick={() => onRemoveField(field.id)}
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Remove
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Position */}
        <div className="space-y-2">
          <Label className="text-xs font-medium flex items-center gap-1">
            <Move className="w-3 h-3" />
            Position (dots)
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">X</Label>
              <Input
                type="number"
                value={field.x}
                onChange={(e) => handleChange('x', Math.max(0, Math.min(labelBounds.width - field.width, parseInt(e.target.value) || 0)))}
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Y</Label>
              <Input
                type="number"
                value={field.y}
                onChange={(e) => handleChange('y', Math.max(0, Math.min(labelBounds.height - field.height, parseInt(e.target.value) || 0)))}
                className="h-8"
              />
            </div>
          </div>
        </div>

        {/* Size */}
        <div className="space-y-2">
          <Label className="text-xs font-medium flex items-center gap-1">
            <Maximize2 className="w-3 h-3" />
            Size (dots)
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Width</Label>
              <Input
                type="number"
                value={field.width}
                onChange={(e) => handleChange('width', Math.max(20, Math.min(labelBounds.width - field.x, parseInt(e.target.value) || 20)))}
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Height</Label>
              <Input
                type="number"
                value={field.height}
                onChange={(e) => handleChange('height', Math.max(16, Math.min(labelBounds.height - field.y, parseInt(e.target.value) || 16)))}
                className="h-8"
              />
            </div>
          </div>
        </div>

        {/* Alignment */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Text Alignment</Label>
          <ToggleGroup
            type="single"
            value={field.alignment}
            onValueChange={(value) => value && handleChange('alignment', value as 'left' | 'center' | 'right')}
            className="justify-start"
          >
            <ToggleGroupItem value="left" size="sm">
              <AlignLeft className="w-4 h-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="center" size="sm">
              <AlignCenter className="w-4 h-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="right" size="sm">
              <AlignRight className="w-4 h-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Font Sizes */}
        {field.fieldKey !== 'barcode' && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Max Font Size</Label>
                <span className="text-xs text-muted-foreground">{field.maxFontSize} dots</span>
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Min Font Size</Label>
                <span className="text-xs text-muted-foreground">{field.minFontSize} dots</span>
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

        {/* Info */}
        <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
          <p>• Font auto-sizes to fit content</p>
          <p>• Falls back to 2 lines if needed</p>
          <p>• Drag handle to move, corner to resize</p>
        </div>
      </CardContent>
    </Card>
  );
};
