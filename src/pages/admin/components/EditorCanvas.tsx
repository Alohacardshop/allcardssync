import React, { useMemo, useRef, useState } from 'react';
import type { LabelTemplate, ZPLElement } from '@/lib/labels/types';
import { DropZone } from '@/components/drag-drop/DropZone';
import { useDragDrop } from '@/components/drag-drop/DragDropProvider';
import { AutoSizeText } from '@/components/AutoSizeText';

type Props = {
  template: LabelTemplate | null;
  scale: number;                        // e.g., 1.5 for precision editing
  onChangeTemplate: (t: LabelTemplate) => void;
  onSelectElement?: (el: ZPLElement | null) => void;
  grid?: number;                        // dot units; default 2
};

type TextEl = Extract<ZPLElement, { type: 'text' }>;
type BarcodeEl = Extract<ZPLElement, { type: 'barcode' }>;
type LineEl = Extract<ZPLElement, { type: 'line' }>;

const isTextEl = (e: ZPLElement): e is TextEl => e.type === 'text';
const isBarcodeEl = (e: ZPLElement): e is BarcodeEl => e.type === 'barcode';
const isLineEl = (e: ZPLElement): e is LineEl => e.type === 'line';

type Handle = 'move' | 'nw' | 'ne' | 'se' | 'sw';

export default function EditorCanvas({ template, scale, onChangeTemplate, onSelectElement, grid = 2 }: Props) {
  const layout = template?.layout;
  const canvasRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [mode, setMode] = useState<Handle | null>(null);
  const [start, setStart] = useState<{ x: number; y: number; el?: ZPLElement } | null>(null);
  const { isDragging, dragItem } = useDragDrop();

  const size = useMemo(() => {
    if (!layout) return { w: 0, h: 0 };
    return { w: Math.max(1, layout.width), h: Math.max(1, layout.height) };
  }, [layout]);

  function snap(v: number) {
    return Math.round(v / grid) * grid;
  }

  function toDotCoords(clientX: number, clientY: number) {
    const box = canvasRef.current!.getBoundingClientRect();
    const x = (clientX - box.left) / scale;
    const y = (clientY - box.top) / scale;
    return { x: Math.max(0, Math.min(size.w, x)), y: Math.max(0, Math.min(size.h, y)) };
  }

  function startInteraction(e: React.MouseEvent, index: number, handle: Handle) {
    if (!layout) return;
    e.stopPropagation();
    setSel(index);
    setMode(handle);
    setStart({ ...toDotCoords(e.clientX, e.clientY), el: layout.elements[index] });
    onSelectElement?.(layout.elements[index]);
  }

  function onCanvasMouseDown(e: React.MouseEvent) {
    // Deselect if clicking empty space
    if (e.target === canvasRef.current) {
      setSel(null);
      setMode(null);
      setStart(null);
      onSelectElement?.(null);
    }
  }

  // Handle keyboard events for deletion
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!layout || sel === null) return;
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const next = structuredClone(template!) as LabelTemplate;
        next.layout!.elements.splice(sel, 1);
        onChangeTemplate(next);
        setSel(null);
        onSelectElement?.(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [layout, sel, template, onChangeTemplate, onSelectElement]);

  const handleDrop = (draggedItem: any, dropX: number, dropY: number) => {
    if (!layout || !draggedItem?.data?.elementType) return;

    const coords = toDotCoords(dropX, dropY);
    const elementType = draggedItem.data.elementType as 'text' | 'barcode' | 'line';
    
    const newElement: ZPLElement = elementType === 'text' 
      ? { type: 'text', x: coords.x, y: coords.y, text: 'New Text', h: 30, w: 100 }
      : elementType === 'barcode'
      ? { type: 'barcode', x: coords.x, y: coords.y, data: '123456', height: 52, moduleWidth: 2 }
      : { type: 'line', x: coords.x, y: coords.y, x2: coords.x + 100, y2: coords.y, thickness: 1 };

    const next = structuredClone(template!) as LabelTemplate;
    next.layout!.elements.push(newElement);
    onChangeTemplate(next);
    onSelectElement?.(newElement);
  };

  function onMouseMove(e: React.MouseEvent) {
    if (!layout || sel == null || !mode || !start) return;
    const cur = toDotCoords(e.clientX, e.clientY);
    const dx = snap(cur.x - start.x);
    const dy = snap(cur.y - start.y);
    const next = structuredClone(template!) as LabelTemplate;
    const el = next.layout!.elements[sel];

    if (mode === 'move') {
      // Move x/y for all element types
      el.x = snap((start.el!.x ?? 0) + dx);
      el.y = snap((start.el!.y ?? 0) + dy);
      clampInside(el, next.layout!.width, next.layout!.height);
      onChangeTemplate(next);
      return;
    }

    // Resize by handle: only supported for text & barcode (lines keep endpoints via future enhancement)
    if (isTextEl(el)) {
      const base = start.el as TextEl;
      if (mode === 'se' || mode === 'ne' || mode === 'sw' || mode === 'nw') {
        // Resize h/w by dy/dx
        const newW = snap(Math.max(8, (base.w ?? 30) + (mode === 'se' || mode === 'ne' ? dx : -dx)));
        const newH = snap(Math.max(8, (base.h ?? 30) + (mode === 'se' || mode === 'sw' ? dy : -dy)));
        el.w = newW;
        el.h = newH;
        if (mode === 'nw' || mode === 'sw') el.x = snap(Math.max(0, base.x + dx));
        if (mode === 'nw' || mode === 'ne') el.y = snap(Math.max(0, base.y + dy));
      }
      clampInside(el, next.layout!.width, next.layout!.height);
      onChangeTemplate(next);
      return;
    }

    if (isBarcodeEl(el)) {
      const base = start.el as BarcodeEl;
      if (mode === 'se' || mode === 'ne' || mode === 'sw' || mode === 'nw') {
        // Horizontal resize -> moduleWidth; Vertical -> height
        const horizDelta = (mode === 'se' || mode === 'ne') ? dx : -dx;
        const vertDelta  = (mode === 'se' || mode === 'sw') ? dy : -dy;
        const newMW = snap(Math.max(1, (base.moduleWidth ?? 2) + horizDelta / 6)); // scale sensitivity
        const newH  = snap(Math.max(10, (base.height ?? 52) + vertDelta));
        el.moduleWidth = newMW;
        el.height = newH;
        if (mode === 'nw' || mode === 'sw') el.x = snap(Math.max(0, base.x + dx));
        if (mode === 'nw' || mode === 'ne') el.y = snap(Math.max(0, base.y + dy));
      }
      clampInside(el, next.layout!.width, next.layout!.height);
      onChangeTemplate(next);
      return;
    }

    // Lines: keep simple move only for now (resize later if needed)
  }

  function onMouseUp() {
    setMode(null);
    setStart(null);
  }

  if (!layout) {
    return (
      <div className="border rounded p-4 text-sm text-muted-foreground">
        No template loaded.
      </div>
    );
  }

  return (
    <div
      className={`relative transition-colors ${
        isDragging ? 'bg-primary/5' : ''
      }`}
      style={{ width: size.w * scale, height: size.h * scale }}
    >
      <DropZone
        id="editor-canvas"
        type="canvas"
        accepts={['element']}
        onDrop={async (item) => {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) {
            // Use mouse position from drag event
            const mouseX = rect.left + rect.width / 2; // Default to center if no mouse pos
            const mouseY = rect.top + rect.height / 2;
            handleDrop(item, mouseX, mouseY);
          }
        }}
        className={`w-full h-full bg-background border-2 rounded shadow-inner ${
          isDragging ? 'border-primary border-dashed' : 'border-border'
        }`}
      >
        <div
          ref={canvasRef}
          className="w-full h-full"
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
        >
      {/* Grid (light 2-dot) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundSize: `${2 * scale}px ${2 * scale}px`,
          backgroundImage:
            `linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px),` +
            `linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)`,
        }}
      />

        {layout.elements.map((el, i) => {
          const screen = elementRect(el);
          const left = screen.x * scale;
          const top = screen.y * scale;
          const w = screen.w * scale;
          const h = screen.h * scale;
          const selected = i === sel;

          return (
            <div
              key={i}
              className={`absolute border-2 rounded transition-all ${
                selected 
                  ? 'border-primary shadow-lg z-10' 
                  : 'border-border hover:border-primary/50 hover:shadow-md'
              }`}
              style={{ left, top, width: w, height: h, cursor: 'move' }}
              onMouseDown={(e) => startInteraction(e, i, 'move')}
              role="button"
              aria-label={`element-${i}`}
            >
              {/* Element render with better styling */}
              <div className={`w-full h-full rounded overflow-hidden ${
                isTextEl(el) 
                  ? 'bg-blue-50 dark:bg-blue-950/20' 
                  : isBarcodeEl(el) 
                    ? 'bg-green-50 dark:bg-green-950/20' 
                    : 'bg-muted'
              }`}>
                {isTextEl(el) ? (
                  <AutoSizeText
                    text={el.text}
                    width={w}
                    height={h}
                    minFontSize={4}
                    maxFontSize={Math.min(w, h)}
                    className="text-gray-800 dark:text-gray-200"
                  />
                ) : isBarcodeEl(el) ? (
                  <div className="flex items-center justify-center h-full">
                    <span className="font-mono text-xs">[{el.data}]</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-xs font-medium">LINE</span>
                  </div>
                )}
              </div>

              {/* Selection handles */}
              {selected && (
                <>
                  {(['nw','ne','se','sw'] as Handle[]).map(hk => (
                    <div
                      key={hk}
                      onMouseDown={(e) => startInteraction(e, i, hk)}
                      className="absolute bg-primary border-2 border-background rounded-full hover:scale-110 transition-transform"
                      style={{
                        width: 12, height: 12,
                        left: hk.includes('w') ? -6 : (hk.includes('e') ? w - 6 : w/2 - 6),
                        top:  hk.includes('n') ? -6 : (hk.includes('s') ? h - 6 : h/2 - 6),
                        cursor: handleCursor(hk),
                      }}
                    />
                  ))}
                  {/* Delete button */}
                  <div
                    className="absolute bg-destructive text-destructive-foreground rounded-full flex items-center justify-center cursor-pointer hover:scale-110 transition-transform text-xs font-bold"
                    style={{
                      width: 16, height: 16,
                      right: -8,
                      top: -8,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = structuredClone(template!) as LabelTemplate;
                      next.layout!.elements.splice(i, 1);
                      onChangeTemplate(next);
                      setSel(null);
                      onSelectElement?.(null);
                    }}
                    title="Delete element (or press Delete key)"
                  >
                    ×
                  </div>
                </>
              )}
            </div>
          );
        })}
        </div>
      </DropZone>
    </div>
  );
}

/** Approximate editor bounding boxes in dot units (stable per element type) */
function elementRect(el: ZPLElement): { x: number; y: number; w: number; h: number } {
  const x = el.x ?? 0;
  const y = el.y ?? 0;

  if (isTextEl(el)) {
    const w = el.maxWidth ?? Math.max(80, (el.w ?? 30) * 6);
    const h = el.h ?? 30;
    return { x, y, w, h };
  }
  if (isBarcodeEl(el)) {
    const w = Math.max(80, (el.moduleWidth ?? 2) * 60);
    const h = el.height ?? 52;
    return { x, y, w, h };
  }
  if (isLineEl(el)) {
    const w = Math.max(1, Math.abs((el.x2 ?? el.x) - el.x));
    const h = Math.max(1, Math.abs((el.y2 ?? el.y) - el.y));
    return { x: Math.min(el.x, el.x2), y: Math.min(el.y, el.y2), w, h };
  }
  // Fallback
  return { x, y, w: 80, h: 30 };
}

function clampInside(el: ZPLElement, width: number, height: number) {
  el.x = Math.max(0, Math.min(width - 4, el.x ?? 0));
  el.y = Math.max(0, Math.min(height - 4, el.y ?? 0));
}

function handleCursor(h: Handle) {
  switch (h) {
    case 'nw': return 'nwse-resize';
    case 'se': return 'nwse-resize';
    case 'ne': return 'nesw-resize';
    case 'sw': return 'nesw-resize';
    default: return 'move';
  }
}
