import React from 'react';
import { cn } from '@/lib/utils';
import { Move, RotateCcw } from 'lucide-react';

interface ResizeHandleProps {
  type: 'corner' | 'edge' | 'move';
  position: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  style?: React.CSSProperties;
  className?: string;
}

export function ResizeHandle({
  type,
  position,
  onMouseDown,
  onTouchStart,
  style,
  className
}: ResizeHandleProps) {
  const isCorner = type === 'corner';
  const isMove = type === 'move';
  
  const getIcon = () => {
    if (isMove) return <Move className="w-3 h-3" />;
    if (isCorner) return <RotateCcw className="w-2 h-2" />;
    return null;
  };

  const getCursor = () => {
    switch (position) {
      case 'nw': return 'nw-resize';
      case 'n': return 'n-resize';
      case 'ne': return 'ne-resize';
      case 'e': return 'e-resize';
      case 'se': return 'se-resize';
      case 's': return 's-resize';
      case 'sw': return 'sw-resize';
      case 'w': return 'w-resize';
      case 'move': return 'move';
      default: return 'default';
    }
  };

  return (
    <div
      className={cn(
        'absolute bg-primary border-2 border-background rounded transition-all duration-200',
        'hover:scale-125 hover:shadow-lg active:scale-110',
        'flex items-center justify-center',
        'touch-manipulation select-none',
        {
          'w-4 h-4': isCorner || isMove,
          'w-3 h-3': !isCorner && !isMove,
          'bg-primary/80 border-primary': isCorner,
          'bg-secondary border-secondary-foreground': isMove,
        },
        className
      )}
      style={{
        cursor: getCursor(),
        ...style
      }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      role="button"
      aria-label={`Resize handle ${position}`}
    >
      {getIcon()}
    </div>
  );
}