import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  Type, 
  QrCode, 
  Package, 
  Square, 
  Minus, 
  MousePointer,
  Grid3X3
} from 'lucide-react';
import { ZPLElement, ZPLLabel, LABEL_DIMENSIONS, generateElementId } from '@/lib/zplElements';

interface ZPLVisualEditorProps {
  label: ZPLLabel;
  onLabelChange: (label: ZPLLabel) => void;
  selectedElement: ZPLElement | null;
  onElementSelect: (element: ZPLElement | null) => void;
  showGrid?: boolean;
  onToggleGrid?: () => void;
}

type Tool = 'select' | 'text' | 'barcode' | 'qr' | 'box' | 'line';

export function ZPLVisualEditor({ 
  label, 
  onLabelChange, 
  selectedElement, 
  onElementSelect,
  showGrid = true,
  onToggleGrid
}: ZPLVisualEditorProps) {
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const scale = 2; // Scale factor for display

  // Helper function to calculate text dimensions
  const calculateTextDimensions = (text: string, fontSize: number): { width: number; height: number } => {
    // Approximate character width based on font size (ZPL fonts are monospace-like)
    const charWidth = fontSize * 0.6; // Rough approximation for ZPL fonts
    const width = text.length * charWidth;
    const height = fontSize;
    return { width, height };
  };

  // Helper function for element hit testing
  const isPointInElement = (x: number, y: number, element: ZPLElement): boolean => {
    const elementX = element.position.x;
    const elementY = element.position.y;
    
    let width = 100;
    let height = 30;
    
    if (element.type === 'text') {
      // Calculate actual text dimensions for better hit testing
      const fontSize = element.fontSize || 20;
      const dimensions = calculateTextDimensions(element.text || '', fontSize);
      width = Math.max(dimensions.width, 50); // Minimum width for easier clicking
      height = Math.max(dimensions.height, 20); // Minimum height for easier clicking
    } else if ('size' in element && element.size) {
      width = element.size.width;
      height = element.size.height;
    } else if (element.type === 'barcode') {
      width = 120;
      height = 60;
    } else if (element.type === 'qr') {
      const magnification = 'magnification' in element ? element.magnification : 3;
      width = 40 * magnification;
      height = 40 * magnification;
    }
    
    return x >= elementX && x <= elementX + width &&
           y >= elementY && y <= elementY + height;
  };

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) / scale);
    const y = Math.round((e.clientY - rect.top) / scale);

    console.log('Canvas click at:', { x, y, activeTool });

    if (activeTool === 'select') {
      // Check if we clicked on an existing element (reverse order for top-most first)
      const clickedElement = [...label.elements].reverse().find(element => {
        const isHit = isPointInElement(x, y, element);
        console.log(`Testing element ${element.id} (${element.type}):`, { 
          elementPos: element.position, 
          isHit,
          elementData: element.type === 'text' ? element.text : element.type
        });
        return isHit;
      });

      if (clickedElement) {
        console.log('Selected element:', clickedElement.id, clickedElement.type);
        onElementSelect(clickedElement);
      } else {
        console.log('No element clicked, deselecting');
        onElementSelect(null);
      }
    } else {
      // Add new element
      let newElement: ZPLElement;

      switch (activeTool) {
        case 'text':
          newElement = {
            id: generateElementId(),
            type: 'text',
            position: { x, y },
            font: '0',
            fontSize: 16,
            fontWidth: 16,
            text: 'New Text',
            rotation: 0
          };
          break;

        case 'barcode':
          newElement = {
            id: generateElementId(),
            type: 'barcode',
            position: { x, y },
            size: { width: 120, height: 50 },
            barcodeType: 'CODE128',
            data: '123456789',
            height: 50,
            humanReadable: false
          };
          break;

        case 'qr':
          newElement = {
            id: generateElementId(),
            type: 'qr',
            position: { x, y },
            model: 2,
            magnification: 3,
            data: 'https://example.com'
          };
          break;

        case 'box':
          newElement = {
            id: generateElementId(),
            type: 'box',
            position: { x, y },
            size: { width: 100, height: 50 },
            thickness: 2
          };
          break;

        case 'line':
          newElement = {
            id: generateElementId(),
            type: 'line',
            position: { x, y },
            size: { width: 100, height: 2 },
            thickness: 2
          };
          break;

        default:
          return;
      }

      onLabelChange({
        ...label,
        elements: [...label.elements, newElement]
      });

      onElementSelect(newElement);
      setActiveTool('select');
    }
  }, [activeTool, label, onLabelChange, onElementSelect, scale]);

  const handleElementMouseDown = useCallback((e: React.MouseEvent, element: ZPLElement) => {
    e.stopPropagation();
    e.preventDefault();
    
    console.log('Element mouse down:', element.id, element.type);
    
    onElementSelect(element);
    
    if (activeTool === 'select') {
      const rect = e.currentTarget.getBoundingClientRect();
      setDragStart({
        x: e.clientX - element.position.x * scale,
        y: e.clientY - element.position.y * scale
      });
      setIsDragging(true);
    }
  }, [activeTool, onElementSelect, scale]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && dragStart && selectedElement) {
      const newX = Math.max(0, Math.min(LABEL_DIMENSIONS.width - 10, (e.clientX - dragStart.x) / scale));
      const newY = Math.max(0, Math.min(LABEL_DIMENSIONS.height - 10, (e.clientY - dragStart.y) / scale));

      const updatedElement = {
        ...selectedElement,
        position: { x: Math.round(newX), y: Math.round(newY) }
      };

      onLabelChange({
        ...label,
        elements: label.elements.map(el => 
          el.id === selectedElement.id ? updatedElement : el
        )
      });

      onElementSelect(updatedElement);
    }
  }, [isDragging, dragStart, selectedElement, label, onLabelChange, onElementSelect, scale]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
  }, []);

  const tools = [
    { id: 'select', icon: MousePointer, label: 'Select' },
    { id: 'text', icon: Type, label: 'Text' },
    { id: 'barcode', icon: Package, label: 'Barcode' },
    { id: 'qr', icon: QrCode, label: 'QR Code' },
    { id: 'box', icon: Square, label: 'Box' },
    { id: 'line', icon: Minus, label: 'Line' }
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>ZPL Visual Editor</CardTitle>
          {onToggleGrid && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleGrid}
              className={showGrid ? 'bg-muted' : ''}
            >
              <Grid3X3 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-2">
          {tools.map(({ id, icon: Icon, label }) => (
            <Button
              key={id}
              variant={activeTool === id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTool(id as Tool)}
              className="flex items-center gap-2"
            >
              <Icon className="w-4 h-4" />
              {label}
            </Button>
          ))}
        </div>

        <Separator />

        {/* Canvas */}
        <div className="flex justify-center">
          <div 
            className="relative bg-white border-2 border-gray-300 cursor-crosshair"
            style={{
              width: `${LABEL_DIMENSIONS.width * scale}px`,
              height: `${LABEL_DIMENSIONS.height * scale}px`,
              backgroundImage: showGrid 
                ? `
                  linear-gradient(to right, #e5e7eb 1px, transparent 1px),
                  linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)
                ` 
                : undefined,
              backgroundSize: showGrid ? `${10 * scale}px ${10 * scale}px` : undefined
            }}
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Render elements */}
            {label.elements.map((element) => {
              const isSelected = selectedElement?.id === element.id;
              const style: React.CSSProperties = {
                position: 'absolute',
                left: `${element.position.x * scale}px`,
                top: `${element.position.y * scale}px`,
                cursor: activeTool === 'select' ? 'move' : 'crosshair',
                fontSize: `${(element.type === 'text' ? element.fontSize : 12) * scale / 2}px`,
                fontFamily: 'monospace',
                color: '#000',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                transform: element.type === 'text' && element.rotation !== 0 
                  ? `rotate(${element.rotation}deg)` 
                  : undefined,
                transformOrigin: 'top left'
              };

              const selectionClass = isSelected 
                ? 'ring-2 ring-blue-500 ring-offset-1' 
                : 'hover:ring-1 hover:ring-gray-400';

              switch (element.type) {
                case 'text':
                  return (
                    <div
                      key={element.id}
                      style={style}
                      className={`${selectionClass} p-1 rounded`}
                      onMouseDown={(e) => handleElementMouseDown(e, element)}
                    >
                      {element.text}
                    </div>
                  );
                
                case 'barcode':
                  return (
                    <div
                      key={element.id}
                      style={{
                        ...style,
                        width: `${element.size.width * scale}px`,
                        height: `${element.size.height * scale}px`,
                        background: 'repeating-linear-gradient(90deg, #000 0px, #000 2px, #fff 2px, #fff 4px)',
                        display: 'flex',
                        alignItems: 'end',
                        justifyContent: 'center',
                        fontSize: `${10 * scale}px`
                      }}
                      className={`${selectionClass} rounded`}
                      onMouseDown={(e) => handleElementMouseDown(e, element)}
                    >
                      {element.humanReadable && (
                        <div style={{ background: '#fff', padding: '2px' }}>
                          {element.data}
                        </div>
                      )}
                    </div>
                  );
                
                case 'qr':
                  return (
                    <div
                      key={element.id}
                      style={{
                        ...style,
                        width: `${40 * element.magnification * scale}px`,
                        height: `${40 * element.magnification * scale}px`,
                        background: `
                          repeating-conic-gradient(from 0deg, #000 0deg 90deg, #fff 90deg 180deg),
                          repeating-linear-gradient(45deg, #000 0px, #000 2px, #fff 2px, #fff 4px)
                        `,
                        border: '2px solid #000'
                      }}
                      className={`${selectionClass} rounded`}
                      onMouseDown={(e) => handleElementMouseDown(e, element)}
                    />
                  );
                
                case 'box':
                  return (
                    <div
                      key={element.id}
                      style={{
                        ...style,
                        width: `${element.size.width * scale}px`,
                        height: `${element.size.height * scale}px`,
                        border: `${element.thickness * scale}px solid #000`
                      }}
                      className={`${selectionClass} rounded`}
                      onMouseDown={(e) => handleElementMouseDown(e, element)}
                    />
                  );
                
                case 'line':
                  return (
                    <div
                      key={element.id}
                      style={{
                        ...style,
                        width: `${element.size.width * scale}px`,
                        height: `${element.thickness * scale}px`,
                        backgroundColor: '#000'
                      }}
                      className={`${selectionClass} rounded`}
                      onMouseDown={(e) => handleElementMouseDown(e, element)}
                    />
                  );
                
                default:
                  return null;
              }
            })}

            {/* Label dimensions overlay */}
            <div className="absolute top-0 left-0 p-2 bg-black bg-opacity-50 text-white text-xs rounded-br">
              2" × 1" ({LABEL_DIMENSIONS.width} × {LABEL_DIMENSIONS.height} dots)
            </div>
          </div>
        </div>

        <div className="text-sm text-muted-foreground text-center">
          {activeTool === 'select' 
            ? 'Click to select elements, drag to move them' 
            : `Click to place a ${activeTool} element`
          }
        </div>
      </CardContent>
    </Card>
  );
}