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
  const isEdge = type === 'edge';
  
  const getIcon = () => {
    if (isMove) return <Move className="w-4 h-4" />;
    if (isCorner) return <RotateCcw className="w-3 h-3" />;
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
        'absolute border-2 border-background rounded-sm transition-all duration-200',
        'hover:scale-110 hover:shadow-xl active:scale-95',
        'flex items-center justify-center',
        'touch-manipulation select-none',
        'shadow-md backdrop-blur-sm',
        {
          // Corner handles - largest and most prominent
          'w-6 h-6 bg-primary border-primary-foreground rounded-md': isCorner,
          // Move handle - distinctive styling
          'w-7 h-7 bg-secondary border-secondary-foreground rounded-full': isMove,
          // Edge handles - medium size, less prominent
          'w-5 h-5 bg-primary/80 border-primary-foreground/80': isEdge,
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
      aria-label={`${type === 'move' ? 'Move' : 'Resize'} handle ${position}`}
      tabIndex={0}
    >
      {getIcon()}
    </div>
  );
}