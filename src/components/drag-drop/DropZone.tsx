import React, { useRef, useEffect, useState } from 'react';
import { useDragDrop } from './DragDropProvider';
import { cn } from '@/lib/utils';

interface DropZoneProps {
  id: string;
  type: 'batch' | 'inventory' | 'trash' | 'archive' | 'canvas';
  accepts: string[];
  children: React.ReactNode;
  className?: string;
  onDrop?: (item: any) => Promise<void>;
  disabled?: boolean;
}

export function DropZone({
  id,
  type,
  accepts,
  children,
  className = '',
  onDrop,
  disabled = false
}: DropZoneProps) {
  const { 
    registerDropZone, 
    unregisterDropZone, 
    handleDrop: contextHandleDrop, 
    dragItem, 
    isDragging 
  } = useDragDrop();
  
  const ref = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);
  const [canDrop, setCanDrop] = useState(false);

  useEffect(() => {
    if (!disabled) {
      registerDropZone({ id, type, accepts });
    }
    
    return () => {
      unregisterDropZone(id);
    };
  }, [id, type, accepts, disabled, registerDropZone, unregisterDropZone]);

  const handleDropAction = async () => {
    if (!dragItem || !accepts.includes(dragItem.type)) return;
    
    try {
      if (onDrop) {
        await onDrop(dragItem.data);
      } else {
        await contextHandleDrop(id, dragItem);
      }
    } catch (error) {
      console.error('Drop error:', error);
    }
  };

  useEffect(() => {
    const element = ref.current;
    if (!element || disabled) return;

    const handleMouseUp = async () => {
      if (isDragging && dragItem && isOver && accepts.includes(dragItem.type)) {
        await handleDropAction();
      }
      setIsOver(false);
      setCanDrop(false);
    };

    const handleTouchEnd = async () => {
      if (isDragging && dragItem && isOver && accepts.includes(dragItem.type)) {
        await handleDropAction();
      }
      setIsOver(false);
      setCanDrop(false);
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, dragItem, isOver, accepts, handleDropAction]);

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-200',
        {
          'drop-zone-active': isDragging && !isOver,
          'drop-zone-can-drop': isOver && canDrop,
          'drop-zone-reject': isOver && !canDrop,
        },
        className
      )}
    >
      {children}
      
      {isDragging && (
        <div className={cn(
          'absolute inset-0 pointer-events-none transition-all duration-200',
          'border-2 border-dashed rounded-lg',
          {
            'border-primary bg-primary/5': !isOver,
            'border-green-500 bg-green-500/10': isOver && canDrop,
            'border-red-500 bg-red-500/10': isOver && !canDrop,
          }
        )}>
          {isOver && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={cn(
                'px-3 py-1 rounded-full text-sm font-medium',
                {
                  'bg-green-500 text-white': canDrop,
                  'bg-red-500 text-white': !canDrop,
                }
              )}>
                {canDrop ? 'Drop here' : 'Cannot drop here'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}