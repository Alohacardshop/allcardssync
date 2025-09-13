import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Trash2 } from 'lucide-react';
import { ZPLElement, ZPL_FONTS } from '@/lib/zplElements';

interface ZPLElementEditorProps {
  element: ZPLElement | null;
  onUpdate: (element: ZPLElement) => void;
  onDelete: (elementId: string) => void;
}

export function ZPLElementEditor({ element, onUpdate, onDelete }: ZPLElementEditorProps) {
  if (!element) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Element Properties</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Select an element to edit its properties</p>
        </CardContent>
      </Card>
    );
  }

  const handlePositionChange = (axis: 'x' | 'y', value: number) => {
    onUpdate({
      ...element,
      position: {
        ...element.position,
        [axis]: value
      }
    });
  };

  const handleSizeChange = (dimension: 'width' | 'height', value: number) => {
    if ('size' in element) {
      onUpdate({
        ...element,
        size: {
          ...element.size,
          [dimension]: value
        }
      });
    }
  };

  const renderElementSpecificFields = () => {
    switch (element.type) {
      case 'text':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="text-content">Text Content</Label>
              <Input
                id="text-content"
                value={element.text}
                onChange={(e) => onUpdate({ ...element, text: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="font-select">Font</Label>
                <Select
                  value={element.font}
                  onValueChange={(value: any) => onUpdate({ ...element, font: value })}
                >
                  <SelectTrigger id="font-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ZPL_FONTS).map(([key, font]) => (
                      <SelectItem key={key} value={key}>
                        {font.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="font-size">Font Size</Label>
                <Input
                  id="font-size"
                  type="number"
                  min="8"
                  max="100"
                  value={element.fontSize}
                  onChange={(e) => onUpdate({ ...element, fontSize: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="font-width">Font Width</Label>
              <Input
                id="font-width"
                type="number"
                min="8"
                max="100"
                value={element.fontWidth}
                onChange={(e) => onUpdate({ ...element, fontWidth: Number(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rotation">Rotation</Label>
              <Select
                value={element.rotation.toString()}
                onValueChange={(value) => onUpdate({ ...element, rotation: Number(value) as any })}
              >
                <SelectTrigger id="rotation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0°</SelectItem>
                  <SelectItem value="90">90°</SelectItem>
                  <SelectItem value="180">180°</SelectItem>
                  <SelectItem value="270">270°</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        );

      case 'barcode':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="barcode-data">Barcode Data</Label>
              <Input
                id="barcode-data"
                value={element.data}
                onChange={(e) => onUpdate({ ...element, data: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="barcode-type">Barcode Type</Label>
              <Select
                value={element.barcodeType}
                onValueChange={(value: any) => onUpdate({ ...element, barcodeType: value })}
              >
                <SelectTrigger id="barcode-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CODE128">Code 128</SelectItem>
                  <SelectItem value="CODE39">Code 39</SelectItem>
                  <SelectItem value="EAN13">EAN-13</SelectItem>
                  <SelectItem value="UPC">UPC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="barcode-height">Height</Label>
              <Input
                id="barcode-height"
                type="number"
                min="20"
                max="200"
                value={element.height}
                onChange={(e) => onUpdate({ ...element, height: Number(e.target.value) })}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="human-readable"
                checked={element.humanReadable}
                onCheckedChange={(checked) => onUpdate({ ...element, humanReadable: checked })}
              />
              <Label htmlFor="human-readable">Human Readable</Label>
            </div>
          </>
        );

      case 'qr':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="qr-data">QR Data</Label>
              <Input
                id="qr-data"
                value={element.data}
                onChange={(e) => onUpdate({ ...element, data: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="qr-model">Model</Label>
                <Select
                  value={element.model.toString()}
                  onValueChange={(value) => onUpdate({ ...element, model: Number(value) as any })}
                >
                  <SelectTrigger id="qr-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Model 1</SelectItem>
                    <SelectItem value="2">Model 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="qr-magnification">Magnification</Label>
                <Input
                  id="qr-magnification"
                  type="number"
                  min="1"
                  max="10"
                  value={element.magnification}
                  onChange={(e) => onUpdate({ ...element, magnification: Number(e.target.value) })}
                />
              </div>
            </div>
          </>
        );

      case 'box':
      case 'line':
        return (
          <div className="space-y-2">
            <Label htmlFor="thickness">Thickness</Label>
            <Input
              id="thickness"
              type="number"
              min="1"
              max="20"
              value={element.thickness}
              onChange={(e) => onUpdate({ ...element, thickness: Number(e.target.value) })}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="capitalize">{element.type} Element</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(element.id)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Position */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="pos-x">X Position</Label>
            <Input
              id="pos-x"
              type="number"
              min="0"
              max="406"
              value={element.position.x}
              onChange={(e) => handlePositionChange('x', Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pos-y">Y Position</Label>
            <Input
              id="pos-y"
              type="number"
              min="0"
              max="203"
              value={element.position.y}
              onChange={(e) => handlePositionChange('y', Number(e.target.value))}
            />
          </div>
        </div>

        {/* Size (for elements that have size) */}
        {'size' in element && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="size-width">Width</Label>
              <Input
                id="size-width"
                type="number"
                min="1"
                max="406"
                value={element.size.width}
                onChange={(e) => handleSizeChange('width', Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="size-height">Height</Label>
              <Input
                id="size-height"
                type="number"
                min="1"
                max="203"
                value={element.size.height}
                onChange={(e) => handleSizeChange('height', Number(e.target.value))}
              />
            </div>
          </div>
        )}

        {/* Element-specific fields */}
        {renderElementSpecificFields()}
      </CardContent>
    </Card>
  );
}