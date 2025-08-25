import React, { useRef, useEffect, useImperativeHandle, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  renderLabelToCanvas, 
  generateLabelPDF, 
  generateLabelPNG, 
  LABEL_WIDTH, 
  LABEL_HEIGHT,
  type LabelData,
  type LabelFieldConfig 
} from '@/lib/labelRenderer';

interface LabelPreviewCanvasProps {
  fieldConfig: LabelFieldConfig & { templateStyle?: string };
  labelData: LabelData;
  showGuides?: boolean;
}

export const LabelPreviewCanvas = React.forwardRef<any, LabelPreviewCanvasProps>(({ fieldConfig, labelData, showGuides = false }, ref) => {
  const [previewImageUrl, setPreviewImageUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Export function to get high-DPI PNG for printing
  const exportToPNG = (dpi: number = 203): Promise<Blob> => {
    return generateLabelPNG(fieldConfig, labelData, dpi);
  };

  // Export function to get PDF for printing
  const exportToPDF = async (): Promise<string> => {
    return generateLabelPDF(fieldConfig, labelData, 203);
  };

  // Expose the export functions through the ref
  useImperativeHandle(ref, () => ({
    exportToPNG,
    exportToPDF
  }));

  // Generate PNG preview (same as what gets printed)
  useEffect(() => {
    const generatePreviewImage = async () => {
      setIsLoading(true);
      try {
        const pngBlob = await generateLabelPNG(fieldConfig, labelData, 203);
        const imageUrl = URL.createObjectURL(pngBlob);
        setPreviewImageUrl(imageUrl);
      } catch (error) {
        console.error('Error generating PNG preview:', error);
      } finally {
        setIsLoading(false);
      }
    };

    generatePreviewImage();

    // Cleanup function to revoke object URL
    return () => {
      if (previewImageUrl) {
        URL.revokeObjectURL(previewImageUrl);
      }
    };
  }, [fieldConfig, labelData]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Label Preview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex justify-center">
          {isLoading ? (
            <div className="w-80 h-60 bg-muted flex items-center justify-center border rounded">
              <span className="text-muted-foreground">Generating preview...</span>
            </div>
          ) : previewImageUrl ? (
            <img
              src={previewImageUrl}
              alt="Label Preview"
              style={{
                maxWidth: '320px',
                maxHeight: '240px',
                border: '1px solid hsl(var(--border))',
                borderRadius: '4px',
                backgroundColor: 'white'
              }}
            />
          ) : (
            <div className="w-80 h-60 bg-muted flex items-center justify-center border rounded">
              <span className="text-muted-foreground">Failed to generate preview</span>
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-2 text-center">
          This preview shows exactly what will be printed. Update settings in the Label Designer to change how labels appear.
        </p>
      </CardContent>
    </Card>
  );
});