import React, { useRef, useEffect } from 'react';
import { useDragDrop } from './DragDropProvider';

interface DraggableItemProps {
  id: string;
  type: 'inventory-item' | 'batch-item' | 'card' | 'element';
  data: any;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function DraggableItem({ 
  id, 
  type, 
  data, 
  children, 
  className = '', 
  disabled = false 
}: DraggableItemProps) {
  const { startDrag, endDrag, isDragging, dragItem } = useDragDrop();
  const ref = useRef<HTMLDivElement>(null);
  const isDraggingThis = dragItem?.id === id;

  useEffect(() => {
    const element = ref.current;
    if (!element || disabled) return;

    let dragStarted = false;
    let startX = 0;
    let startY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      startX = e.clientX;
      startY = e.clientY;
      dragStarted = false;
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = Math.abs(e.clientX - startX);
      const deltaY = Math.abs(e.clientY - startY);
      
      if (!dragStarted && (deltaX > 5 || deltaY > 5)) {
        dragStarted = true;
        startDrag({ id, type, data });
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      if (dragStarted) {
        endDrag();
      }
    };

    // Touch events for mobile
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      dragStarted = false;
      
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault(); // Prevent scrolling
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - startX);
      const deltaY = Math.abs(touch.clientY - startY);
      
      if (!dragStarted && (deltaX > 10 || deltaY > 10)) {
        dragStarted = true;
        startDrag({ id, type, data });
        
        // Provide haptic feedback on supported devices
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
      }
    };

    const handleTouchEnd = () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      
      if (dragStarted) {
        endDrag();
      }
    };

    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('touchstart', handleTouchStart);

    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      element.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [id, type, data, startDrag, endDrag, disabled]);

  return (
    <div
      ref={ref}
      className={`
        draggable-item
        ${disabled ? 'cursor-default' : 'cursor-grab'}
        ${isDraggingThis ? 'opacity-50 transform rotate-2 scale-105 z-50' : ''}
        ${isDragging && !isDraggingThis ? 'opacity-75' : ''}
        ${className}
      `}
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none',
        touchAction: disabled ? 'auto' : 'none'
      }}
    >
      {children}
      
      {/* Visual indicator for draggable items */}
      {!disabled && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-2 h-2 bg-muted-foreground rounded-full" />
          <div className="w-2 h-2 bg-muted-foreground rounded-full mt-1" />
          <div className="w-2 h-2 bg-muted-foreground rounded-full mt-1" />
        </div>
      )}
    </div>
  );
}