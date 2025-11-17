import React, { useRef, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, ZoomIn, ZoomOut, AlertCircle } from 'lucide-react';
import { renderZPLToCanvas, validateZPL } from '@/lib/zplRenderer';
import { toast } from 'sonner';

interface ZPLPreviewCanvasProps {
  zpl: string;
  variables: Record<string, string>;
  className?: string;
}

export const ZPLPreviewCanvas: React.FC<ZPLPreviewCanvasProps> = ({ 
  zpl, 
  variables,
  className 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(2);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const renderPreview = async () => {
      if (!canvasRef.current || !zpl) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        // Validate ZPL first
        const validation = validateZPL(zpl);
        if (!validation.valid) {
          setError(validation.error || 'Invalid ZPL');
          return;
        }
        
        // Render to canvas
        await renderZPLToCanvas(canvasRef.current, zpl, variables, {
          width: 406,
          height: 203,
          scale: scale,
          showBorder: true
        });
      } catch (err) {
        console.error('ZPL rendering error:', err);
        setError(err instanceof Error ? err.message : 'Failed to render preview');
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce rendering
    const timeoutId = setTimeout(renderPreview, 300);
    return () => clearTimeout(timeoutId);
  }, [zpl, variables, scale]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    
    try {
      canvasRef.current.toBlob((blob) => {
        if (!blob) {
          toast.error('Failed to generate image');
          return;
        }
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `label-preview-${Date.now()}.png`;
        link.click();
        URL.revokeObjectURL(url);
        
        toast.success('Preview downloaded');
      }, 'image/png');
    } catch (err) {
      toast.error('Download failed');
    }
  };

  const handleZoom = (direction: 'in' | 'out') => {
    setScale(prev => {
      if (direction === 'in') return Math.min(prev + 0.5, 4);
      return Math.max(prev - 0.5, 1);
    });
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Visual Preview</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              {scale}x
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleZoom('out')}
              disabled={scale <= 1}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleZoom('in')}
              disabled={scale >= 4}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              disabled={!!error || isLoading}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex justify-center">
          {error ? (
            <div className="flex flex-col items-center justify-center p-8 text-center border border-destructive/50 rounded-lg bg-destructive/5">
              <AlertCircle className="h-12 w-12 text-destructive mb-3" />
              <p className="text-sm font-medium text-destructive mb-1">Preview Error</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center p-8 border rounded-lg bg-muted/50">
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-muted-foreground">Rendering...</span>
              </div>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className="border rounded shadow-sm bg-white"
              style={{
                maxWidth: '100%',
                height: 'auto'
              }}
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Label: 2" × 1" (406×203 dots @ 203 DPI)
        </p>
      </CardContent>
    </Card>
  );
};
