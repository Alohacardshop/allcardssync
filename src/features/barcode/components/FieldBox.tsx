import React, { useRef, useState, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import type { LabelField, FieldKey, SampleData } from '../types/labelLayout';
import { FIELD_LABELS } from '../types/labelLayout';
import { calculateOptimalFontSize, dotsToPixels } from '../utils/textFitting';
import { GripVertical } from 'lucide-react';

interface FieldBoxProps {
  field: LabelField;
  scale: number;
  isSelected: boolean;
  onSelect: () => void;
  sampleData: SampleData;
  isPreviewMode: boolean;
  onResize?: (fieldId: string, width: number, height: number) => void;
}

export const FieldBox: React.FC<FieldBoxProps> = ({
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

  const style: React.CSSProperties = {
    position: 'absolute',
    left: dotsToPixels(field.x, scale),
    top: dotsToPixels(field.y, scale),
    width: dotsToPixels(field.width, scale),
    height: dotsToPixels(field.height, scale),
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    zIndex: isDragging ? 1000 : isSelected ? 100 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  const sampleValue = sampleData[field.fieldKey] || '';
  const isBarcode = field.fieldKey === 'barcode';
  
  // Calculate font size for preview
  const { fontSize, lines, isTwoLine } = calculateOptimalFontSize(
    sampleValue,
    dotsToPixels(field.width, scale) - 8,
    dotsToPixels(field.maxFontSize, scale) * 0.6,
    dotsToPixels(field.minFontSize, scale) * 0.6
  );

  const handleResizeStart = (e: React.MouseEvent) => {
    if (isPreviewMode) return;
    e.stopPropagation();
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={cn(
        'rounded border-2 transition-colors cursor-pointer overflow-hidden',
        isSelected
          ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
          : 'border-border/60 bg-background/80 hover:border-primary/50',
        isDragging && 'shadow-lg',
        isPreviewMode && 'cursor-default'
      )}
    >
      {/* Field content */}
      <div className="w-full h-full flex flex-col items-stretch justify-center p-1 overflow-hidden">
        {!isPreviewMode && (
          <div className="absolute top-0 left-0 px-1 bg-muted/90 text-[9px] font-medium text-muted-foreground rounded-br">
            {FIELD_LABELS[field.fieldKey]}
          </div>
        )}
        
        {isBarcode ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="flex gap-[1px] h-[60%] items-end">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="bg-foreground"
                  style={{
                    width: Math.random() > 0.5 ? 2 : 1,
                    height: `${60 + Math.random() * 40}%`,
                  }}
                />
              ))}
            </div>
            <span className="text-[10px] font-mono mt-1 truncate max-w-full">
              {sampleValue}
            </span>
          </div>
        ) : (
          <div
            className={cn(
              'w-full leading-tight',
              field.alignment === 'center' && 'text-center',
              field.alignment === 'right' && 'text-right',
              field.alignment === 'left' && 'text-left'
            )}
            style={{ fontSize: `${fontSize}px` }}
          >
            {lines.map((line, i) => (
              <div key={i} className="truncate">
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Drag handle */}
      {!isPreviewMode && isSelected && (
        <div
          {...attributes}
          {...listeners}
          className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground rounded-full p-0.5 cursor-grab active:cursor-grabbing shadow-sm"
        >
          <GripVertical className="w-3 h-3" />
        </div>
      )}

      {/* Resize handle */}
      {!isPreviewMode && isSelected && (
        <div
          onMouseDown={handleResizeStart}
          className={cn(
            'absolute -bottom-1 -right-1 w-3 h-3 bg-primary rounded-sm cursor-se-resize shadow-sm',
            isResizing && 'bg-primary/80'
          )}
        />
      )}
    </div>
  );
};
