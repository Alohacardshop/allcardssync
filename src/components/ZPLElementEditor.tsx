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
            <div className="space-y-4">
              <div>
                <Label htmlFor="text">Text</Label>
                <Input
                  id="text"
                  value={element.text}
                  onChange={(e) => onUpdate({ ...element, text: e.target.value })}
                  placeholder="Enter text"
                />
              </div>
              
              <div>
                <Label htmlFor="font">Font</Label>
                <Select 
                  value={element.font} 
                  onValueChange={(value: any) => 
                    onUpdate({ ...element, font: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
            {Object.entries(ZPL_FONTS).map(([key, font]) => (
              <SelectItem key={key} value={key}>
                Font {key} ({font.baseHeight}x{font.baseWidth})
              </SelectItem>
            ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="fontSize">Font Size</Label>
                  <Input
                    id="fontSize"
                    type="number"
                    value={element.fontSize}
                    onChange={(e) => onUpdate({ ...element, fontSize: parseInt(e.target.value) || 0 })}
                    min="1"
                    max="100"
                  />
                </div>
                <div>
                  <Label htmlFor="fontWidth">Font Width</Label>
                  <Input
                    id="fontWidth"
                    type="number"
                    value={element.fontWidth}
                    onChange={(e) => onUpdate({ ...element, fontWidth: parseInt(e.target.value) || 0 })}
                    min="1"
                    max="100"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="rotation">Rotation</Label>
                <Select 
                  value={element.rotation.toString()} 
                  onValueChange={(value) => 
                    onUpdate({ ...element, rotation: parseInt(value) as 0 | 90 | 180 | 270 })
                  }
                >
                  <SelectTrigger>
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

              {/* Bounding Box Controls */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <Label>Bounding Box</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const updatedElement = { ...element };
                      if (updatedElement.boundingBox) {
                        delete updatedElement.boundingBox;
                        delete updatedElement.autoSize;
                        delete updatedElement.textOverflow;
                      } else {
                        updatedElement.boundingBox = { width: 150, height: 30 };
                        updatedElement.autoSize = 'shrink-to-fit';
                        updatedElement.textOverflow = 'ellipsis';
                      }
                      onUpdate(updatedElement);
                    }}
                  >
                    {element.boundingBox ? 'Remove' : 'Add'}
                  </Button>
                </div>
                
                {element.boundingBox && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="boundingWidth">Width</Label>
                        <Input
                          id="boundingWidth"
                          type="number"
                          value={element.boundingBox.width}
                          onChange={(e) => onUpdate({
                            ...element,
                            boundingBox: {
                              ...element.boundingBox!,
                              width: parseInt(e.target.value) || 0
                            }
                          })}
                          min="10"
                        />
                      </div>
                      <div>
                        <Label htmlFor="boundingHeight">Height</Label>
                        <Input
                          id="boundingHeight"
                          type="number"
                          value={element.boundingBox.height}
                          onChange={(e) => onUpdate({
                            ...element,
                            boundingBox: {
                              ...element.boundingBox!,
                              height: parseInt(e.target.value) || 0
                            }
                          })}
                          min="10"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="autoSize">Auto Size</Label>
                      <Select
                        value={element.autoSize || 'none'}
                        onValueChange={(value: 'none' | 'shrink-to-fit') =>
                          onUpdate({ ...element, autoSize: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="shrink-to-fit">Shrink to Fit</SelectItem>
                          <SelectItem value="grow-to-fit">Grow to Fit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="textOverflow">Text Overflow</Label>
                      <Select
                        value={element.textOverflow || 'clip'}
                        onValueChange={(value: 'clip' | 'ellipsis' | 'wrap') =>
                          onUpdate({ ...element, textOverflow: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="clip">Clip</SelectItem>
                          <SelectItem value="ellipsis">Ellipsis (...)</SelectItem>
            <SelectItem value="wrap">Wrap</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="barcode-width">Width (Module)</Label>
                <Input
                  id="barcode-width"
                  type="number"
                  min="1"
                  max="10"
                  value={element.size?.width || 120}
                  onChange={(e) => onUpdate({ 
                    ...element, 
                    size: { 
                      ...element.size, 
                      width: Number(e.target.value),
                      height: element.size?.height || element.height
                    }
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="barcode-height">Height</Label>
                <Input
                  id="barcode-height"
                  type="number"
                  min="20"
                  max="200"
                  value={element.height}
                  onChange={(e) => onUpdate({ 
                    ...element, 
                    height: Number(e.target.value),
                    size: {
                      ...element.size,
                      width: element.size?.width || 120,
                      height: Number(e.target.value)
                    }
                  })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="barcode-ratio">Wide:Narrow Ratio</Label>
              <Select
                value={(element.size?.height || 3).toString()}
                onValueChange={(value) => onUpdate({ 
                  ...element, 
                  size: { 
                    ...element.size, 
                    height: Number(value) 
                  }
                })}
              >
                <SelectTrigger id="barcode-ratio">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2:1</SelectItem>
                  <SelectItem value="3">3:1 (Recommended)</SelectItem>
                  <SelectItem value="4">4:1</SelectItem>
                </SelectContent>
              </Select>
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