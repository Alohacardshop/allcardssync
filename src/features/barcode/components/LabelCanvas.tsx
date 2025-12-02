import React from 'react';
import { DndContext, DragEndEvent, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { LabelLayout, LabelField, SampleData } from '../types/labelLayout';
import { FieldBox } from './FieldBox';
import { dotsToPixels, pixelsToDots } from '../utils/textFitting';

interface LabelCanvasProps {
  layout: LabelLayout;
  scale: number;
  selectedFieldId: string | null;
  onSelectField: (fieldId: string | null) => void;
  onUpdateField: (fieldId: string, updates: Partial<LabelField>) => void;
  sampleData: SampleData;
  isPreviewMode: boolean;
  showGrid: boolean;
}

export const LabelCanvas: React.FC<LabelCanvasProps> = ({
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
        distance: 5,
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
      
      // Snap to grid (8 dots = ~1mm)
      const snapSize = 8;
      const snappedX = Math.round(newX / snapSize) * snapSize;
      const snappedY = Math.round(newY / snapSize) * snapSize;
      
      onUpdateField(field.id, { x: snappedX, y: snappedY });
    }
  };

  const handleResize = (fieldId: string, width: number, height: number) => {
    const field = layout.fields.find((f) => f.id === fieldId);
    if (field) {
      // Ensure field stays within bounds
      const maxWidth = layout.widthDots - field.x;
      const maxHeight = layout.heightDots - field.y;
      
      onUpdateField(fieldId, {
        width: Math.min(width, maxWidth),
        height: Math.min(height, maxHeight),
      });
    }
  };

  const enabledFields = layout.fields.filter((f) => f.enabled);

  return (
    <div className="relative inline-block">
      {/* Canvas container */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div
          className={cn(
            'relative bg-white border-2 border-border rounded shadow-md overflow-hidden',
            isPreviewMode ? 'cursor-default' : 'cursor-crosshair'
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
                  id="grid"
                  width={dotsToPixels(16, scale)}
                  height={dotsToPixels(16, scale)}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${dotsToPixels(16, scale)} 0 L 0 0 0 ${dotsToPixels(16, scale)}`}
                    fill="none"
                    stroke="hsl(var(--border))"
                    strokeWidth="0.5"
                    opacity="0.3"
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
                    stroke="hsl(var(--border))"
                    strokeWidth="1"
                    opacity="0.5"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
              <rect width="100%" height="100%" fill="url(#grid-major)" />
            </svg>
          )}

          {/* Field boxes */}
          {enabledFields.map((field) => (
            <FieldBox
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
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <p className="text-sm">Add fields from the palette →</p>
            </div>
          )}
        </div>
      </DndContext>

      {/* Dimensions label */}
      <div className="text-center mt-2 text-xs text-muted-foreground">
        {layout.widthDots} × {layout.heightDots} dots ({(layout.widthDots / layout.dpi).toFixed(1)}" × {(layout.heightDots / layout.dpi).toFixed(1)}") @ {layout.dpi} DPI
      </div>
    </div>
  );
};
