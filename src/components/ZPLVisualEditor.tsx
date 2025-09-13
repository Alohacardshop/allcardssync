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
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  const scale = 2; // Scale factor for display

  // Helper function to calculate text dimensions
  const calculateTextDimensions = (text: string, fontSize: number, fontWidth?: number): { width: number; height: number } => {
    // Approximate character width based on font size (ZPL fonts are monospace-like)
    const charWidth = (fontWidth || fontSize) * 0.6; // Rough approximation for ZPL fonts
    const width = text.length * charWidth;
    const height = fontSize;
    return { width, height };
  };

  // Helper function to get element display dimensions
  const getElementDisplayDimensions = (element: ZPLElement): { width: number; height: number } => {
    if (element.type === 'text') {
      // Use bounding box if available, otherwise calculate text dimensions
      if (element.boundingBox) {
        return element.boundingBox;
      }
      const fontSize = element.fontSize || 20;
      const fontWidth = element.fontWidth || fontSize;
      return calculateTextDimensions(element.text || '', fontSize, fontWidth);
    } else if ('size' in element && element.size) {
      return element.size;
    } else if (element.type === 'barcode') {
      return { width: 120, height: 60 };
    } else if (element.type === 'qr') {
      const magnification = 'magnification' in element ? element.magnification : 3;
      return { width: 40 * magnification, height: 40 * magnification };
    }
    return { width: 100, height: 30 };
  };

  // Helper function for element hit testing
  const isPointInElement = (x: number, y: number, element: ZPLElement): boolean => {
    const elementX = element.position.x;
    const elementY = element.position.y;
    
    const dimensions = getElementDisplayDimensions(element);
    const width = Math.max(dimensions.width, 20); // Minimum width for easier clicking
    const height = Math.max(dimensions.height, 15); // Minimum height for easier clicking
    
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
            rotation: 0,
            boundingBox: { width: 150, height: 30 },
            autoSize: 'shrink-to-fit',
            textOverflow: 'ellipsis'
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
    // Don't start dragging if we're already resizing
    if (isResizing) return;
    
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
  }, [activeTool, onElementSelect, scale, isResizing]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isResizing && resizeHandle && selectedElement && selectedElement.type === 'text' && selectedElement.boundingBox) {
      const canvasContainer = e.currentTarget as HTMLElement;
      const rect = canvasContainer.getBoundingClientRect();

      const mouseX = (e.clientX - rect.left) / scale;
      const mouseY = (e.clientY - rect.top) / scale;

      const elementX = selectedElement.position.x;
      const elementY = selectedElement.position.y;

      let newWidth = selectedElement.boundingBox.width;
      let newHeight = selectedElement.boundingBox.height;
      let newX = elementX;
      let newY = elementY;

      switch (resizeHandle) {
        case 'se': // southeast
          newWidth = Math.max(20, mouseX - elementX);
          newHeight = Math.max(15, mouseY - elementY);
          break;
        case 'sw': // southwest
          newWidth = Math.max(20, elementX + selectedElement.boundingBox.width - mouseX);
          newHeight = Math.max(15, mouseY - elementY);
          newX = mouseX;
          break;
        case 'ne': // northeast
          newWidth = Math.max(20, mouseX - elementX);
          newHeight = Math.max(15, elementY + selectedElement.boundingBox.height - mouseY);
          newY = mouseY;
          break;
        case 'nw': // northwest
          newWidth = Math.max(20, elementX + selectedElement.boundingBox.width - mouseX);
          newHeight = Math.max(15, elementY + selectedElement.boundingBox.height - mouseY);
          newX = mouseX;
          newY = mouseY;
          break;
        case 'e': // east
          newWidth = Math.max(20, mouseX - elementX);
          break;
        case 'w': // west
          newWidth = Math.max(20, elementX + selectedElement.boundingBox.width - mouseX);
          newX = mouseX;
          break;
        case 's': // south
          newHeight = Math.max(15, mouseY - elementY);
          break;
        case 'n': // north
          newHeight = Math.max(15, elementY + selectedElement.boundingBox.height - mouseY);
          newY = mouseY;
          break;
      }

      const updatedElement = {
        ...selectedElement,
        position: { x: Math.round(newX), y: Math.round(newY) },
        boundingBox: {
          width: Math.round(newWidth),
          height: Math.round(newHeight)
        }
      };

      onLabelChange({
        ...label,
        elements: label.elements.map(el => 
          el.id === selectedElement.id ? updatedElement : el
        )
      });

      onElementSelect(updatedElement);
    } else if (isDragging && dragStart && selectedElement && !isResizing) {
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
  }, [isDragging, dragStart, selectedElement, label, onLabelChange, onElementSelect, scale, isResizing, resizeHandle]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
    setIsResizing(false);
    setResizeHandle(null);
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('Starting resize with handle:', handle);
    setIsResizing(true);
    setResizeHandle(handle);
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
            className="canvas-container relative bg-white border-2 border-gray-300 cursor-crosshair"
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
                  console.log(`Rendering text element ${element.id} with boundingBox:`, element.boundingBox);
                  
                  // Calculate font size to fit within bounding box
                  const getAdjustedFontSize = () => {
                    if (!element.boundingBox || element.autoSize !== 'shrink-to-fit') {
                      return (element.fontSize || 20) * scale / 2;
                    }
                    
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return (element.fontSize || 20) * scale / 2;

                    const maxWidth = element.boundingBox.width * scale * 0.9; // 90% of box width for padding
                    const maxHeight = element.boundingBox.height * scale * 0.8; // 80% of box height for padding
                    let fontSize = (element.fontSize || 20) * scale / 2;
                    
                    // Measure text with current font size
                    ctx.font = `${fontSize}px monospace`;
                    let textWidth = ctx.measureText(element.text || '').width;
                    let textHeight = fontSize;
                    
                    // Scale font size to fit width
                    if (textWidth > maxWidth && textWidth > 0) {
                      fontSize = (fontSize * maxWidth) / textWidth;
                    }
                    
                    // Scale font size to fit height
                    if (textHeight > maxHeight && textHeight > 0) {
                      fontSize = Math.min(fontSize, maxHeight);
                    }
                    
                    return Math.max(fontSize, 8); // Minimum font size of 8px
                  };

                  const renderTextContent = () => {
                    if (element.boundingBox && element.textOverflow === 'wrap') {
                      // Calculate wrapped lines for display
                      const fontSize = element.fontSize || 20;
                      const charWidth = fontSize * 0.6;
                      const maxCharsPerLine = Math.floor(element.boundingBox.width / charWidth);
                      const lines = element.text.split(' ').reduce((acc: string[], word) => {
                        if (acc.length === 0) return [word];
                        const lastLine = acc[acc.length - 1];
                        if ((lastLine + ' ' + word).length <= maxCharsPerLine) {
                          acc[acc.length - 1] = lastLine + ' ' + word;
                        } else {
                          acc.push(word);
                        }
                        return acc;
                      }, []);

                      return (
                        <div style={{ lineHeight: '1.2' }}>
                          {lines.map((line, index) => (
                            <div key={index}>{line}</div>
                          ))}
                        </div>
                      );
                    }
                    return element.text;
                  };

                  return (
                    <React.Fragment key={element.id}>
                      <div
                        style={{
                          position: 'absolute',
                          left: `${element.position.x * scale}px`,
                          top: `${element.position.y * scale}px`,
                          fontSize: `${getAdjustedFontSize()}px`,
                          fontFamily: 'monospace',
                          color: '#000',
                          width: element.boundingBox ? `${element.boundingBox.width * scale}px` : 'auto',
                          height: element.boundingBox ? `${element.boundingBox.height * scale}px` : 'auto',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '2px',
                          backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(229, 231, 235, 0.3)',
                          border: isSelected ? '2px solid rgb(59, 130, 246)' : '1px solid rgb(156, 163, 175)',
                          borderRadius: '2px',
                          cursor: activeTool === 'select' ? 'move' : 'crosshair',
                          userSelect: 'none',
                          transform: element.rotation !== 0 ? `rotate(${element.rotation}deg)` : undefined,
                          transformOrigin: 'top left'
                        }}
                        className={`${selectionClass}`}
                        onMouseDown={(e) => handleElementMouseDown(e, element)}
                      >
                        {renderTextContent()}
                      </div>
                      {/* Show bounding box when selected */}
                      {isSelected && element.boundingBox && (
                        <>
                          <div
                            style={{
                              position: 'absolute',
                              left: `${element.position.x * scale}px`,
                              top: `${element.position.y * scale}px`,
                              width: `${element.boundingBox.width * scale}px`,
                              height: `${element.boundingBox.height * scale}px`,
                              border: '2px dashed rgb(59, 130, 246)',
                              backgroundColor: 'rgba(59, 130, 246, 0.05)',
                              pointerEvents: 'none',
                              borderRadius: '4px'
                            }}
                          />
                          {/* Resize handles */}
                          {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => {
                            const isCorner = ['nw', 'ne', 'se', 'sw'].includes(handle);
                            const size = 12;
                            let left = 0, top = 0, cursor = '';

                            switch (handle) {
                              case 'nw': left = -size/2; top = -size/2; cursor = 'nw-resize'; break;
                              case 'n': left = element.boundingBox!.width * scale / 2 - size/2; top = -size/2; cursor = 'n-resize'; break;
                              case 'ne': left = element.boundingBox!.width * scale - size/2; top = -size/2; cursor = 'ne-resize'; break;
                              case 'e': left = element.boundingBox!.width * scale - size/2; top = element.boundingBox!.height * scale / 2 - size/2; cursor = 'e-resize'; break;
                              case 'se': left = element.boundingBox!.width * scale - size/2; top = element.boundingBox!.height * scale - size/2; cursor = 'se-resize'; break;
                              case 's': left = element.boundingBox!.width * scale / 2 - size/2; top = element.boundingBox!.height * scale - size/2; cursor = 's-resize'; break;
                              case 'sw': left = -size/2; top = element.boundingBox!.height * scale - size/2; cursor = 'sw-resize'; break;
                              case 'w': left = -size/2; top = element.boundingBox!.height * scale / 2 - size/2; cursor = 'w-resize'; break;
                            }

                            return (
                              <div
                                key={`resize-${handle}`}
                                style={{
                                  position: 'absolute',
                                  left: `${element.position.x * scale + left}px`,
                                  top: `${element.position.y * scale + top}px`,
                                  width: `${size}px`,
                                  height: `${size}px`,
                                  backgroundColor: '#ffffff',
                                  border: '2px solid rgb(59, 130, 246)',
                                  borderRadius: isCorner ? '50%' : '2px',
                                  cursor,
                                  zIndex: 1001,
                                  boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                                  pointerEvents: 'auto',
                                  transform: 'translate(0, 0)' // Force new stacking context
                                }}
                                onMouseDown={(e) => {
                                  console.log('🎯 Resize handle clicked:', handle, 'at', { x: e.clientX, y: e.clientY });
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleResizeStart(e, handle);
                                }}
                                onMouseEnter={() => console.log('👆 Hovering resize handle:', handle)}
                                onMouseLeave={() => console.log('👋 Left resize handle:', handle)}
                              />
                            );
                          })}
                        </>
                      )}
                    </React.Fragment>
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