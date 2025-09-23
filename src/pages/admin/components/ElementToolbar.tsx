import React from 'react';
import { Button } from "@/components/ui/button";
import { DraggableItem } from '@/components/drag-drop/DraggableItem';
import { Type, BarChart3, Minus } from "lucide-react";

interface ElementToolbarProps {
  onAddElement: (type: 'text' | 'barcode' | 'line') => void;
}

export default function ElementToolbar({ onAddElement }: ElementToolbarProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      <DraggableItem
        id="text-tool"
        type="element"
        data={{ elementType: 'text' }}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAddElement('text')}
          className="flex items-center gap-2"
        >
          <Type className="w-4 h-4" />
          Text
        </Button>
      </DraggableItem>

      <DraggableItem
        id="barcode-tool"
        type="element"
        data={{ elementType: 'barcode' }}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAddElement('barcode')}
          className="flex items-center gap-2"
        >
          <BarChart3 className="w-4 h-4" />
          Barcode
        </Button>
      </DraggableItem>

      <DraggableItem
        id="line-tool"
        type="element"
        data={{ elementType: 'line' }}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAddElement('line')}
          className="flex items-center gap-2"
        >
          <Minus className="w-4 h-4" />
          Line
        </Button>
      </DraggableItem>
    </div>
  );
}