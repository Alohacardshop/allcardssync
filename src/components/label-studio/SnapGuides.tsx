import React from 'react';
import { cn } from '@/lib/utils';

interface SnapGuidesProps {
  visible: boolean;
  guides: Array<{
    type: 'vertical' | 'horizontal';
    position: number;
    highlight?: boolean;
  }>;
  scale: number;
  canvasSize: { width: number; height: number };
}

export function SnapGuides({ visible, guides, scale, canvasSize }: SnapGuidesProps) {
  if (!visible || guides.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {guides.map((guide, index) => (
        <div
          key={index}
          className={cn(
            'absolute transition-opacity duration-200',
            {
              'border-l border-primary/60': guide.type === 'vertical',
              'border-t border-primary/60': guide.type === 'horizontal',
              'border-primary border-dashed': guide.highlight,
              'shadow-sm': guide.highlight,
            }
          )}
          style={{
            left: guide.type === 'vertical' ? guide.position * scale : 0,
            top: guide.type === 'horizontal' ? guide.position * scale : 0,
            width: guide.type === 'vertical' ? 0 : canvasSize.width * scale,
            height: guide.type === 'horizontal' ? 0 : canvasSize.height * scale,
          }}
        />
      ))}
    </div>
  );
}