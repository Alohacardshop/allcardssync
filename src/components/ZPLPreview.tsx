import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { ZPLLabel, generateZPLFromElements } from '@/lib/zplElements';

interface ZPLPreviewProps {
  label: ZPLLabel;
}

export function ZPLPreview({ label }: ZPLPreviewProps) {
  const [showRawZPL, setShowRawZPL] = useState(false);
  
  const zplCode = generateZPLFromElements(label);
  
  const handleCopyZPL = async () => {
    try {
      await navigator.clipboard.writeText(zplCode);
      toast.success('ZPL code copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy ZPL code');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>ZPL Preview</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRawZPL(!showRawZPL)}
            >
              {showRawZPL ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyZPL}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="visual" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="visual">Visual</TabsTrigger>
            <TabsTrigger value="code">ZPL Code</TabsTrigger>
          </TabsList>
          
          <TabsContent value="visual" className="space-y-4">
            <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-4">
              <div 
                className="relative bg-white border border-gray-400"
                style={{
                  width: `${label.width / 2}px`, // Scale down for display
                  height: `${label.height / 2}px`,
                  transform: 'scale(1)',
                  transformOrigin: 'top left'
                }}
              >
                {/* Render elements as HTML approximations */}
                {label.elements.map((element) => {
                  // Calculate font size for text elements (matching visual editor logic)
                  const getPreviewFontSize = () => {
                    if (element.type !== 'text' || !element.boundingBox || element.autoSize !== 'shrink-to-fit') {
                      return (element.type === 'text' ? element.fontSize || 20 : 12) / 2;
                    }
                    
                    const scale = 0.5; // Preview scale
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return (element.fontSize || 20) / 2;

                    const maxWidth = element.boundingBox.width * scale * 0.9;
                    const maxHeight = element.boundingBox.height * scale * 0.8;
                    const text = element.text || '';
                    
                    if (!text) return 4; // 8px at full scale = 4px at preview scale
                    
                    let fontSize = Math.min(maxWidth / text.length * 2, maxHeight);
                    
                    ctx.font = `${fontSize}px monospace`;
                    let textWidth = ctx.measureText(text).width;
                    
                    if (textWidth > 0) {
                      fontSize = (fontSize * maxWidth) / textWidth;
                    }
                    
                    fontSize = Math.min(fontSize, maxHeight);
                    return Math.max(fontSize, 4); // Minimum 4px for preview
                  };

                  const style: React.CSSProperties = {
                    position: 'absolute',
                    left: `${element.position.x / 2}px`,
                    top: `${element.position.y / 2}px`,
                    fontSize: `${getPreviewFontSize()}px`,
                    fontFamily: 'monospace',
                    color: '#000',
                    whiteSpace: 'nowrap',
                    transform: element.type === 'text' && element.rotation !== 0 
                      ? `rotate(${element.rotation}deg)` 
                      : undefined,
                    transformOrigin: 'top left'
                  };

                  switch (element.type) {
                    case 'text':
                      return (
                        <div
                          key={element.id}
                          style={style}
                          className={element.selected ? 'ring-2 ring-blue-500' : ''}
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
                            width: `${element.size.width / 2}px`,
                            height: `${element.size.height / 2}px`,
                            background: 'repeating-linear-gradient(90deg, #000 0px, #000 1px, #fff 1px, #fff 2px)',
                            display: 'flex',
                            alignItems: 'end',
                            justifyContent: 'center',
                            fontSize: '8px'
                          }}
                          className={element.selected ? 'ring-2 ring-blue-500' : ''}
                        >
                          {element.humanReadable && (
                            <div style={{ background: '#fff', padding: '1px' }}>
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
                            width: `${40 * element.magnification}px`,
                            height: `${40 * element.magnification}px`,
                            background: `
                              repeating-conic-gradient(from 0deg, #000 0deg 90deg, #fff 90deg 180deg),
                              repeating-linear-gradient(45deg, #000 0px, #000 2px, #fff 2px, #fff 4px)
                            `,
                            border: '1px solid #000'
                          }}
                          className={element.selected ? 'ring-2 ring-blue-500' : ''}
                        />
                      );
                    
                    case 'box':
                      return (
                        <div
                          key={element.id}
                          style={{
                            ...style,
                            width: `${element.size.width / 2}px`,
                            height: `${element.size.height / 2}px`,
                            border: `${element.thickness}px solid #000`
                          }}
                          className={element.selected ? 'ring-2 ring-blue-500' : ''}
                        />
                      );
                    
                    case 'line':
                      return (
                        <div
                          key={element.id}
                          style={{
                            ...style,
                            width: `${element.size.width / 2}px`,
                            height: `${element.thickness}px`,
                            backgroundColor: '#000'
                          }}
                          className={element.selected ? 'ring-2 ring-blue-500' : ''}
                        />
                      );
                    
                    default:
                      return null;
                  }
                })}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Preview scaled to 50% of actual size (2" × 1" label at 203 DPI)
            </p>
          </TabsContent>
          
          <TabsContent value="code" className="space-y-4">
            <div className="relative">
              <pre className="bg-gray-100 p-4 rounded-lg text-sm font-mono overflow-x-auto max-h-96 overflow-y-auto">
                {showRawZPL ? zplCode : zplCode.split('\n').map((line, i) => (
                  <div key={i} className="hover:bg-gray-200 px-1">
                    <span className="text-gray-500 mr-2 select-none">{String(i + 1).padStart(2, '0')}</span>
                    {line}
                  </div>
                ))}
              </pre>
            </div>
            <div className="flex justify-between items-center text-sm text-muted-foreground">
              <span>{zplCode.split('\n').length} lines, {zplCode.length} characters</span>
              <Button variant="outline" size="sm" onClick={handleCopyZPL}>
                <Copy className="w-4 h-4 mr-2" />
                Copy ZPL
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}