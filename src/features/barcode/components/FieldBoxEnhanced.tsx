import React, { useRef, useState, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import type { LabelField, SampleData } from '../types/labelLayout';
import { FIELD_LABELS } from '../types/labelLayout';
import { calculateOptimalFontSize, dotsToPixels } from '../utils/textFitting';
import { GripVertical, Move } from 'lucide-react';

interface FieldBoxEnhancedProps {
  field: LabelField;
  scale: number;
  isSelected: boolean;
  onSelect: () => void;
  sampleData: SampleData;
  isPreviewMode: boolean;
  onResize?: (fieldId: string, width: number, height: number) => void;
}

export const FieldBoxEnhanced: React.FC<FieldBoxEnhancedProps> = ({
  field,
  scale,
  isSelected,
  onSelect,
  sampleData,
  isPreviewMode,
  onResize,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: field.id,
    data: { field },
    disabled: isPreviewMode,
  });

  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);

  const pixelX = dotsToPixels(field.x, scale);
  const pixelY = dotsToPixels(field.y, scale);
  const pixelWidth = dotsToPixels(field.width, scale);
  const pixelHeight = dotsToPixels(field.height, scale);

  const style: React.CSSProperties = {
    position: 'absolute',
    left: pixelX,
    top: pixelY,
    width: pixelWidth,
    height: pixelHeight,
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    zIndex: isDragging ? 1000 : isSelected ? 100 : 1,
    opacity: isDragging ? 0.9 : 1,
  };

  const sampleValue = sampleData[field.fieldKey] || '';
  const isBarcode = field.fieldKey === 'barcode';
  
  // Calculate font size for preview
  const { fontSize, lines, isTwoLine } = calculateOptimalFontSize(
    sampleValue,
    pixelWidth - 8,
    dotsToPixels(field.maxFontSize, scale) * 0.6,
    dotsToPixels(field.minFontSize, scale) * 0.6
  );

  const handleResizeStart = (e: React.MouseEvent) => {
    if (isPreviewMode) return;
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: field.width,
      startHeight: field.height,
    };
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current || !onResize) return;
      
      const deltaX = (e.clientX - resizeRef.current.startX) / scale;
      const deltaY = (e.clientY - resizeRef.current.startY) / scale;
      
      const newWidth = Math.max(40, Math.round(resizeRef.current.startWidth + deltaX));
      const newHeight = Math.max(20, Math.round(resizeRef.current.startHeight + deltaY));
      
      onResize(field.id, newWidth, newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, scale, field.id, onResize]);

  // Color coding by field type
  const fieldColors: Record<string, { bg: string; border: string; label: string }> = {
    title: { bg: 'bg-blue-50', border: 'border-blue-300', label: 'bg-blue-100 text-blue-700' },
    price: { bg: 'bg-green-50', border: 'border-green-300', label: 'bg-green-100 text-green-700' },
    sku: { bg: 'bg-purple-50', border: 'border-purple-300', label: 'bg-purple-100 text-purple-700' },
    condition: { bg: 'bg-amber-50', border: 'border-amber-300', label: 'bg-amber-100 text-amber-700' },
    barcode: { bg: 'bg-slate-50', border: 'border-slate-400', label: 'bg-slate-100 text-slate-700' },
    set: { bg: 'bg-cyan-50', border: 'border-cyan-300', label: 'bg-cyan-100 text-cyan-700' },
    cardNumber: { bg: 'bg-pink-50', border: 'border-pink-300', label: 'bg-pink-100 text-pink-700' },
    year: { bg: 'bg-orange-50', border: 'border-orange-300', label: 'bg-orange-100 text-orange-700' },
    vendor: { bg: 'bg-teal-50', border: 'border-teal-300', label: 'bg-teal-100 text-teal-700' },
  };

  const colors = fieldColors[field.fieldKey] || { bg: 'bg-muted/50', border: 'border-border', label: 'bg-muted text-muted-foreground' };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={cn(
        'rounded border-2 transition-all overflow-hidden',
        isPreviewMode 
          ? 'border-transparent bg-transparent cursor-default' 
          : isSelected
            ? `${colors.border} ${colors.bg} ring-2 ring-primary/40 shadow-md cursor-move`
            : `border-border/40 ${colors.bg} hover:border-primary/50 cursor-pointer`,
        isDragging && 'shadow-xl ring-2 ring-primary/60'
      )}
    >
      {/* Field content */}
      <div className="w-full h-full flex flex-col items-stretch justify-center p-1 overflow-hidden">
        {/* Field label badge */}
        {!isPreviewMode && (
          <div className={cn(
            'absolute -top-0.5 left-1 px-1.5 py-0 text-[9px] font-semibold rounded-b',
            colors.label
          )}>
            {FIELD_LABELS[field.fieldKey]}
            {isTwoLine && <span className="ml-1 opacity-60">2L</span>}
          </div>
        )}
        
        {isBarcode ? (
          <div className="flex flex-col items-center justify-center h-full pt-2">
            <div className="flex gap-[1px] h-[55%] items-end">
              {[...Array(Math.min(24, Math.floor(pixelWidth / 8)))].map((_, i) => (
                <div
                  key={i}
                  className="bg-foreground"
                  style={{
                    width: Math.max(1, Math.floor(scale * 0.8)),
                    height: `${50 + (i % 3) * 20}%`,
                  }}
                />
              ))}
            </div>
            <span className="text-[10px] font-mono mt-1 truncate max-w-full px-1">
              {sampleValue}
            </span>
          </div>
        ) : (
          <div
            className={cn(
              'w-full leading-tight pt-2',
              field.alignment === 'center' && 'text-center',
              field.alignment === 'right' && 'text-right',
              field.alignment === 'left' && 'text-left'
            )}
            style={{ fontSize: `${Math.max(10, fontSize)}px` }}
          >
            {lines.map((line, i) => (
              <div key={i} className="truncate px-0.5">
                {line || '\u00A0'}
              </div>
            ))}
          </div>
        )}

        {/* Font size indicator */}
        {!isPreviewMode && isSelected && !isBarcode && (
          <div className="absolute bottom-0.5 right-1 text-[8px] font-mono text-muted-foreground bg-background/80 px-1 rounded">
            {Math.round(fontSize / scale / 0.6)}pt
          </div>
        )}
      </div>

      {/* Drag handle - full box is draggable when selected */}
      {!isPreviewMode && isSelected && (
        <div
          {...attributes}
          {...listeners}
          className="absolute inset-0 cursor-move"
          style={{ zIndex: 5 }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary/10 rounded-full p-1.5 opacity-0 hover:opacity-100 transition-opacity">
            <Move className="w-4 h-4 text-primary/60" />
          </div>
        </div>
      )}

      {/* Resize handles - corners */}
      {!isPreviewMode && isSelected && (
        <>
          {/* Bottom-right */}
          <div
            onMouseDown={handleResizeStart}
            className={cn(
              'absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-primary rounded-sm cursor-se-resize shadow-md border-2 border-background z-10',
              isResizing && 'scale-110'
            )}
          />
          {/* Bottom edge indicator */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-primary/30 rounded-full" />
          {/* Right edge indicator */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-primary/30 rounded-full" />
        </>
      )}

      {/* Size tooltip when resizing */}
      {isResizing && (
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-20">
          {field.width} × {field.height}
        </div>
      )}
    </div>
  );
};
