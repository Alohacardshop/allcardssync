import React from 'react';
import { DndContext, DragEndEvent, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { LabelLayout, LabelField, SampleData } from '../types/labelLayout';
import { FieldBoxEnhanced } from './FieldBoxEnhanced';
import { dotsToPixels, pixelsToDots } from '../utils/textFitting';

interface LabelCanvasEnhancedProps {
  layout: LabelLayout;
  scale: number;
  selectedFieldId: string | null;
  onSelectField: (fieldId: string | null) => void;
  onUpdateField: (fieldId: string, updates: Partial<LabelField>) => void;
  sampleData: SampleData;
  isPreviewMode: boolean;
  showGrid: boolean;
}

export const LabelCanvasEnhanced: React.FC<LabelCanvasEnhancedProps> = ({
  layout,
  scale,
  selectedFieldId,
  onSelectField,
  onUpdateField,
  sampleData,
  isPreviewMode,
  showGrid,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    })
  );

  const canvasWidth = dotsToPixels(layout.widthDots, scale);
  const canvasHeight = dotsToPixels(layout.heightDots, scale);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event;
    const field = layout.fields.find((f) => f.id === active.id);
    
    if (field && delta) {
      const newX = Math.max(0, Math.min(layout.widthDots - field.width, field.x + pixelsToDots(delta.x, scale)));
      const newY = Math.max(0, Math.min(layout.heightDots - field.height, field.y + pixelsToDots(delta.y, scale)));
      
      // Snap to 8-dot grid
      const snapSize = 8;
      const snappedX = Math.round(newX / snapSize) * snapSize;
      const snappedY = Math.round(newY / snapSize) * snapSize;
      
      onUpdateField(field.id, { x: snappedX, y: snappedY });
    }
  };

  const handleResize = (fieldId: string, width: number, height: number) => {
    const field = layout.fields.find((f) => f.id === fieldId);
    if (field) {
      const maxWidth = layout.widthDots - field.x;
      const maxHeight = layout.heightDots - field.y;
      
      // Snap to 8-dot grid
      const snapSize = 8;
      const snappedWidth = Math.round(Math.min(width, maxWidth) / snapSize) * snapSize;
      const snappedHeight = Math.round(Math.min(height, maxHeight) / snapSize) * snapSize;
      
      onUpdateField(fieldId, {
        width: Math.max(40, snappedWidth),
        height: Math.max(16, snappedHeight),
      });
    }
  };

  const enabledFields = layout.fields.filter((f) => f.enabled);

  return (
    <div className="relative inline-block">
      {/* Shadow/depth effect */}
      <div 
        className="absolute inset-0 bg-foreground/5 rounded-lg translate-x-2 translate-y-2"
        style={{ width: canvasWidth, height: canvasHeight }}
      />
      
      {/* Canvas container */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div
          className={cn(
            'relative bg-white border-2 rounded-lg overflow-hidden transition-shadow',
            isPreviewMode 
              ? 'border-border shadow-sm cursor-default' 
              : 'border-primary/30 shadow-lg cursor-crosshair'
          )}
          style={{
            width: canvasWidth,
            height: canvasHeight,
          }}
          onClick={() => onSelectField(null)}
        >
          {/* Grid overlay */}
          {showGrid && !isPreviewMode && (
            <svg
              className="absolute inset-0 pointer-events-none"
              width={canvasWidth}
              height={canvasHeight}
            >
              <defs>
                <pattern
                  id="grid-minor"
                  width={dotsToPixels(16, scale)}
                  height={dotsToPixels(16, scale)}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${dotsToPixels(16, scale)} 0 L 0 0 0 ${dotsToPixels(16, scale)}`}
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="0.5"
                  />
                </pattern>
                <pattern
                  id="grid-major"
                  width={dotsToPixels(80, scale)}
                  height={dotsToPixels(80, scale)}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${dotsToPixels(80, scale)} 0 L 0 0 0 ${dotsToPixels(80, scale)}`}
                    fill="none"
                    stroke="#d1d5db"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid-minor)" />
              <rect width="100%" height="100%" fill="url(#grid-major)" />
            </svg>
          )}

          {/* Field boxes */}
          {enabledFields.map((field) => (
            <FieldBoxEnhanced
              key={field.id}
              field={field}
              scale={scale}
              isSelected={selectedFieldId === field.id}
              onSelect={() => onSelectField(field.id)}
              sampleData={sampleData}
              isPreviewMode={isPreviewMode}
              onResize={handleResize}
            />
          ))}

          {/* Empty state */}
          {enabledFields.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded">
                Enable fields from the palette
              </p>
            </div>
          )}

          {/* Center guides when dragging */}
          {!isPreviewMode && selectedFieldId && (
            <>
              <div 
                className="absolute top-0 bottom-0 w-px bg-primary/20 pointer-events-none"
                style={{ left: canvasWidth / 2 }}
              />
              <div 
                className="absolute left-0 right-0 h-px bg-primary/20 pointer-events-none"
                style={{ top: canvasHeight / 2 }}
              />
            </>
          )}
        </div>
      </DndContext>

      {/* Dimensions label */}
      <div className="text-center mt-2 text-xs text-muted-foreground">
        {layout.widthDots} × {layout.heightDots} dots • {(layout.widthDots / layout.dpi).toFixed(1)}" × {(layout.heightDots / layout.dpi).toFixed(1)}" @ {layout.dpi} DPI
      </div>
    </div>
  );
};
