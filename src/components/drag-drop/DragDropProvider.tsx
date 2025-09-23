import React, { createContext, useContext, useState, useCallback } from 'react';
import { toast } from 'sonner';

interface DragItem {
  id: string;
  type: 'inventory-item' | 'batch-item' | 'card' | 'element';
  data: any;
}

interface DropZone {
  id: string;
  type: 'batch' | 'inventory' | 'trash' | 'archive' | 'canvas';
  accepts: string[];
}

interface DragDropContextType {
  dragItem: DragItem | null;
  isDragging: boolean;
  dropZones: DropZone[];
  startDrag: (item: DragItem) => void;
  endDrag: () => void;
  registerDropZone: (zone: DropZone) => void;
  unregisterDropZone: (zoneId: string) => void;
  handleDrop: (zoneId: string, item: DragItem) => Promise<void>;
  onDrop?: (zoneId: string, item: DragItem) => Promise<void>;
}

const DragDropContext = createContext<DragDropContextType | null>(null);

interface DragDropProviderProps {
  children: React.ReactNode;
  onDrop?: (zoneId: string, item: DragItem) => Promise<void>;
}

export function DragDropProvider({ children, onDrop }: DragDropProviderProps) {
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropZones, setDropZones] = useState<DropZone[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const startDrag = useCallback((item: DragItem) => {
    setDragItem(item);
    setIsDragging(true);
    
    // Add drag class to body for global styles
    document.body.classList.add('dragging');
  }, []);

  const endDrag = useCallback(() => {
    setDragItem(null);
    setIsDragging(false);
    
    // Remove drag class from body
    document.body.classList.remove('dragging');
  }, []);

  const registerDropZone = useCallback((zone: DropZone) => {
    setDropZones(prev => [...prev.filter(z => z.id !== zone.id), zone]);
  }, []);

  const unregisterDropZone = useCallback((zoneId: string) => {
    setDropZones(prev => prev.filter(z => z.id !== zoneId));
  }, []);

  const handleDrop = useCallback(async (zoneId: string, item: DragItem) => {
    try {
      if (onDrop) {
        await onDrop(zoneId, item);
      }
      
      // Default drop handling based on zone type
      const zone = dropZones.find(z => z.id === zoneId);
      if (zone) {
        switch (zone.type) {
          case 'batch':
            toast.success(`Moved ${item.data.name || 'item'} to batch`);
            break;
          case 'inventory':
            toast.success(`Moved ${item.data.name || 'item'} to inventory`);
            break;
          case 'trash':
            toast.success(`Deleted ${item.data.name || 'item'}`);
            break;
          case 'archive':
            toast.success(`Archived ${item.data.name || 'item'}`);
            break;
          default:
            toast.success('Item moved successfully');
        }
      }
    } catch (error) {
      console.error('Drop error:', error);
      toast.error('Failed to move item');
    }
  }, [dropZones, onDrop]);

  const value: DragDropContextType = {
    dragItem,
    isDragging,
    dropZones,
    startDrag,
    endDrag,
    registerDropZone,
    unregisterDropZone,
    handleDrop,
    onDrop
  };

  return (
    <DragDropContext.Provider value={value}>
      {children}
      {/* Global drag styles */}
      <style>{`
        .dragging {
          cursor: grabbing !important;
        }
        .dragging * {
          cursor: grabbing !important;
        }
        .drop-zone-active {
          background-color: hsl(var(--primary) / 0.1);
          border: 2px dashed hsl(var(--primary));
          transition: all 0.2s ease;
        }
        .drop-zone-can-drop {
          background-color: hsl(var(--success) / 0.1);
          border-color: hsl(var(--success));
        }
        .drop-zone-reject {
          background-color: hsl(var(--destructive) / 0.1);
          border-color: hsl(var(--destructive));
        }
        .draggable-item {
          cursor: grab;
          transition: transform 0.2s ease;
        }
        .draggable-item:hover {
          transform: translateY(-2px);
        }
        .dragging .draggable-item {
          opacity: 0.8;
          transform: rotate(5deg);
        }
      `}</style>
    </DragDropContext.Provider>
  );
}

export function useDragDrop() {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error('useDragDrop must be used within a DragDropProvider');
  }
  return context;
}