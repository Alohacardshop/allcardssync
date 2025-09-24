import React, { useMemo, useRef, useState, useEffect } from 'react';
import type { LabelTemplate, ZPLElement } from '@/lib/labels/types';
import { DropZone } from '@/components/drag-drop/DropZone';
import { useDragDrop } from '@/components/drag-drop/DragDropProvider';
import { AutoSizeText } from '@/components/AutoSizeText';
import { ResizeHandle } from '@/components/label-studio/ResizeHandle';
import { SnapGuides } from '@/components/label-studio/SnapGuides';
import { MeasurementTooltip } from '@/components/label-studio/MeasurementTooltip';

type Props = {
  template: LabelTemplate | null;
  scale: number;                        // e.g., 1.5 for precision editing
  onChangeTemplate: (t: LabelTemplate) => void;
  onSelectElement?: (el: ZPLElement | null) => void;
  grid?: number;                        // dot units; default 2
  testVars?: any;                       // Test variables for preview
};

type TextEl = Extract<ZPLElement, { type: 'text' }>;
type BarcodeEl = Extract<ZPLElement, { type: 'barcode' }>;
type LineEl = Extract<ZPLElement, { type: 'line' }>;

const isTextEl = (e: ZPLElement): e is TextEl => e.type === 'text';
const isBarcodeEl = (e: ZPLElement): e is BarcodeEl => e.type === 'barcode';
const isLineEl = (e: ZPLElement): e is LineEl => e.type === 'line';

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

export default function EditorCanvas({ template, scale, onChangeTemplate, onSelectElement, grid = 2, testVars }: Props) {
  const layout = template?.layout;
  const canvasRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [mode, setMode] = useState<Handle | null>(null);
  const [start, setStart] = useState<{ x: number; y: number; el?: ZPLElement } | null>(null);
  const [isDraggingElement, setIsDraggingElement] = useState(false);
  const [showSnapGuides, setShowSnapGuides] = useState(false);
  const [snapGuides, setSnapGuides] = useState<Array<{type: 'vertical' | 'horizontal'; position: number; highlight?: boolean}>>([]);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [measurements, setMeasurements] = useState<{x?: number; y?: number; width?: number; height?: number}>({});
  const [measurementPos, setMeasurementPos] = useState({ x: 0, y: 0 });
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const { isDragging, dragItem } = useDragDrop();

  const size = useMemo(() => {
    if (!layout) return { w: 0, h: 0 };
    return { w: Math.max(1, layout.width), h: Math.max(1, layout.height) };
  }, [layout]);

  // Helper function to get display text with test data
  const getDisplayText = (element: ZPLElement) => {
    if (!isTextEl(element) || !testVars) return isTextEl(element) ? element.text : '';
    
    let text = element.text;
    
    // Apply test variable replacements
    if (element.id === 'cardinfo') {
      const cardName = testVars.CARDNAME ?? 'CARD NAME';
      const setInfo = testVars.SETNAME ?? 'Set Name';
      const cardNumber = testVars.CARDNUMBER ?? '#001';
      return `${cardName} • ${setInfo} • ${cardNumber}`;
    }
    if (element.id === 'condition') return testVars.CONDITION ?? text;
    if (element.id === 'price') return testVars.PRICE ?? text;
    if (element.id === 'sku') return testVars.SKU ?? text;
    
    // Handle placeholder replacements
    if (text && typeof text === 'string') {
      text = text
        .replace(/{{CARDNAME}}/g, testVars.CARDNAME ?? 'CARD NAME')
        .replace(/{{CONDITION}}/g, testVars.CONDITION ?? 'NM')
        .replace(/{{PRICE}}/g, testVars.PRICE ?? '$0.00')
        .replace(/{{SKU}}/g, testVars.SKU ?? 'SKU123');
    }
    
    return text;
  };

  // Helper function to get display barcode data
  const getDisplayBarcode = (element: ZPLElement) => {
    if (!isBarcodeEl(element) || !testVars) return isBarcodeEl(element) ? element.data : '';
    if (element.id === 'barcode' || element.id?.startsWith('barcode-')) {
      return testVars.BARCODE ?? element.data ?? 'SKU123';
    }
    return element.data;
  };

  function snap(v: number) {
    if (keys.has('Alt')) return v; // Disable snapping with Alt key
    return Math.round(v / grid) * grid;
  }

  // Generate snap guides based on existing elements and grid
  const generateSnapGuides = (currentEl: ZPLElement, currentIndex: number) => {
    if (!layout) return [];
    
    const guides: Array<{type: 'vertical' | 'horizontal'; position: number; highlight?: boolean}> = [];
    const currentRect = elementRect(currentEl);
    
    // Add grid lines
    for (let x = 0; x <= size.w; x += grid * 5) {
      guides.push({ type: 'vertical', position: x });
    }
    for (let y = 0; y <= size.h; y += grid * 5) {
      guides.push({ type: 'horizontal', position: y });
    }
    
    // Add element alignment guides
    layout.elements.forEach((el, i) => {
      if (i === currentIndex) return;
      const rect = elementRect(el);
      
      // Vertical alignment guides
      if (Math.abs(rect.x - currentRect.x) < 10) {
        guides.push({ type: 'vertical', position: rect.x, highlight: true });
      }
      if (Math.abs((rect.x + rect.w) - (currentRect.x + currentRect.w)) < 10) {
        guides.push({ type: 'vertical', position: rect.x + rect.w, highlight: true });
      }
      
      // Horizontal alignment guides
      if (Math.abs(rect.y - currentRect.y) < 10) {
        guides.push({ type: 'horizontal', position: rect.y, highlight: true });
      }
      if (Math.abs((rect.y + rect.h) - (currentRect.y + currentRect.h)) < 10) {
        guides.push({ type: 'horizontal', position: rect.y + rect.h, highlight: true });
      }
    });
    
    return guides;
  };

  function toDotCoords(clientX: number, clientY: number) {
    const box = canvasRef.current!.getBoundingClientRect();
    const x = (clientX - box.left) / scale;
    const y = (clientY - box.top) / scale;
    return { x: Math.max(0, Math.min(size.w, x)), y: Math.max(0, Math.min(size.h, y)) };
  }

  function startInteraction(e: React.MouseEvent | React.TouchEvent, index: number, handle: Handle) {
    if (!layout) return;
    e.stopPropagation();
    setSel(index);
    setMode(handle);
    setIsDraggingElement(true);
    setShowSnapGuides(true);
    setShowMeasurements(true);
    
    const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
    const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
    
    const coords = toDotCoords(clientX, clientY);
    setStart({ ...coords, el: layout.elements[index] });
    onSelectElement?.(layout.elements[index]);
    
    // Generate initial snap guides
    setSnapGuides(generateSnapGuides(layout.elements[index], index));
    
    // Haptic feedback for touch devices
    if ('vibrate' in navigator && 'touches' in e) {
      navigator.vibrate(50);
    }
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

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      setKeys(prev => new Set(prev).add(e.key));
      
      if (!layout || sel === null) return;
      
      // Delete element
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const next = structuredClone(template!) as LabelTemplate;
        next.layout!.elements.splice(sel, 1);
        onChangeTemplate(next);
        setSel(null);
        onSelectElement?.(null);
        return;
      }
      
      // Arrow key movement
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const next = structuredClone(template!) as LabelTemplate;
        const el = next.layout!.elements[sel];
        const step = e.shiftKey ? grid * 5 : grid;
        
        switch (e.key) {
          case 'ArrowUp': el.y = Math.max(0, el.y - step); break;
          case 'ArrowDown': el.y = Math.min(size.h - 10, el.y + step); break;
          case 'ArrowLeft': el.x = Math.max(0, el.x - step); break;
          case 'ArrowRight': el.x = Math.min(size.w - 10, el.x + step); break;
        }
        
        clampInside(el, next.layout!.width, next.layout!.height);
        onChangeTemplate(next);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      setKeys(prev => {
        const newKeys = new Set(prev);
        newKeys.delete(e.key);
        return newKeys;
      });
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [layout, sel, template, onChangeTemplate, onSelectElement, grid, size]);

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

  function onMouseMove(e: React.MouseEvent | React.TouchEvent) {
    if (!layout || sel == null || !mode || !start) return;
    
    const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
    const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
    
    const cur = toDotCoords(clientX, clientY);
    const dx = snap(cur.x - start.x);
    const dy = snap(cur.y - start.y);
    const next = structuredClone(template!) as LabelTemplate;
    const el = next.layout!.elements[sel];

    // Update measurements tooltip
    setMeasurementPos({ x: cur.x, y: cur.y });

    if (mode === 'move') {
      // Move x/y for all element types
      el.x = snap((start.el!.x ?? 0) + dx);
      el.y = snap((start.el!.y ?? 0) + dy);
      clampInside(el, next.layout!.width, next.layout!.height);
      
      // Update measurements
      setMeasurements({ x: el.x, y: el.y });
      
      // Update snap guides
      setSnapGuides(generateSnapGuides(el, sel));
      
      onChangeTemplate(next);
      return;
    }

    // Handle corner resizing with proportional option
    const isCornerHandle = ['nw', 'ne', 'sw', 'se'].includes(mode);
    const maintainAspectRatio = keys.has('Shift') || isCornerHandle;

    // Resize by handle: enhanced for all element types
    if (isTextEl(el)) {
      const base = start.el as TextEl;
      let newW = base.w ?? 30;
      let newH = base.h ?? 30;
      let newX = base.x;
      let newY = base.y;

      if (isCornerHandle) {
        // Corner handles - diagonal resize
        const aspectRatio = (base.w ?? 30) / (base.h ?? 30);
        
        if (mode === 'se') {
          newW = snap(Math.max(20, newW + dx));
          newH = maintainAspectRatio ? newW / aspectRatio : snap(Math.max(10, newH + dy));
        } else if (mode === 'sw') {
          newW = snap(Math.max(20, newW - dx));
          newH = maintainAspectRatio ? newW / aspectRatio : snap(Math.max(10, newH + dy));
          newX = snap(Math.max(0, base.x + dx));
        } else if (mode === 'ne') {
          newW = snap(Math.max(20, newW + dx));
          newH = maintainAspectRatio ? newW / aspectRatio : snap(Math.max(10, newH - dy));
          newY = snap(Math.max(0, base.y + dy));
        } else if (mode === 'nw') {
          newW = snap(Math.max(20, newW - dx));
          newH = maintainAspectRatio ? newW / aspectRatio : snap(Math.max(10, newH - dy));
          newX = snap(Math.max(0, base.x + dx));
          newY = snap(Math.max(0, base.y + dy));
        }
      } else {
        // Edge handles
        if (mode === 'e' || mode === 'w') {
          newW = snap(Math.max(20, (base.w ?? 30) + (mode === 'e' ? dx : -dx)));
          if (mode === 'w') newX = snap(Math.max(0, base.x + dx));
        } else if (mode === 'n' || mode === 's') {
          newH = snap(Math.max(10, (base.h ?? 30) + (mode === 's' ? dy : -dy)));
          if (mode === 'n') newY = snap(Math.max(0, base.y + dy));
        }
      }

      // Apply constraints before setting values
      const maxW = next.layout!.width - newX;
      const maxH = next.layout!.height - newY;
      
      el.w = Math.min(newW, maxW);
      el.h = Math.min(newH, maxH);
      el.x = newX;
      el.y = newY;
      
      setMeasurements({ width: el.w, height: el.h });
    }

    if (isBarcodeEl(el)) {
      const base = start.el as BarcodeEl;
      let newMW = base.moduleWidth ?? 2;
      let newH = base.height ?? 52;
      let newX = base.x;
      let newY = base.y;

      if (isCornerHandle) {
        // Corner handles for barcodes
        if (['se', 'ne'].includes(mode)) {
          newMW = snap(Math.max(1, newMW + dx / 10));
        } else if (['sw', 'nw'].includes(mode)) {
          newMW = snap(Math.max(1, newMW - dx / 10));
          newX = snap(Math.max(0, base.x + dx));
        }
        
        if (['se', 'sw'].includes(mode)) {
          newH = snap(Math.max(10, newH + dy));
        } else if (['ne', 'nw'].includes(mode)) {
          newH = snap(Math.max(10, newH - dy));
          newY = snap(Math.max(0, base.y + dy));
        }
      } else {
        // Edge handles
        if (mode === 'e' || mode === 'w') {
          const horizDelta = (mode === 'e') ? dx : -dx;
          newMW = snap(Math.max(1, newMW + horizDelta / 10));
          if (mode === 'w') newX = snap(Math.max(0, base.x + dx));
        } else if (mode === 'n' || mode === 's') {
          const vertDelta = (mode === 's') ? dy : -dy;
          newH = snap(Math.max(10, newH + vertDelta));
          if (mode === 'n') newY = snap(Math.max(0, base.y + dy));
        }
      }

      // Apply constraints before setting values
      const maxW = next.layout!.width - newX;
      const maxH = next.layout!.height - newY;
      const maxModuleWidth = maxW / 60;
      
      el.moduleWidth = Math.min(newMW, maxModuleWidth);
      el.height = Math.min(newH, maxH);
      el.x = newX;
      el.y = newY;
      
      setMeasurements({ width: el.moduleWidth * 60, height: el.height });
    }

    clampInside(el, next.layout!.width, next.layout!.height);
    onChangeTemplate(next);
  }

  function onMouseUp() {
    setMode(null);
    setStart(null);
    setIsDraggingElement(false);
    setShowSnapGuides(false);
    setShowMeasurements(false);
    setSnapGuides([]);
    setMeasurements({});
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
          onTouchMove={(e) => onMouseMove(e)}
          onTouchEnd={onMouseUp}
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
                className={`absolute border-2 rounded transition-all duration-200 ${
                  selected 
                    ? 'border-primary shadow-xl z-10 ring-2 ring-primary/20' 
                    : 'border-border hover:border-primary/50 hover:shadow-md'
                } ${isDraggingElement && selected ? 'shadow-2xl scale-[1.02]' : ''}`}
                style={{ 
                  left, 
                  top, 
                  width: w, 
                  height: h, 
                  cursor: selected ? 'move' : 'pointer',
                  transform: isDraggingElement && selected ? 'rotate(0.5deg)' : 'none'
                }}
                onMouseDown={(e) => startInteraction(e, i, 'move')}
                onTouchStart={(e) => startInteraction(e, i, 'move')}
                role="button"
                aria-label={`element-${i}`}
              >
                {/* Element render with better styling */}
                <div className={`w-full h-full rounded overflow-hidden transition-all duration-200 ${
                  isTextEl(el) 
                    ? 'bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800' 
                    : isBarcodeEl(el) 
                      ? 'bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800' 
                      : 'bg-muted border border-muted-foreground/20'
                } ${selected ? 'bg-opacity-80' : ''}`}>
                  {isTextEl(el) ? (
                    <AutoSizeText
                      text={getDisplayText(el)}
                      width={w}
                      height={h}
                      minFontSize={4}
                      maxFontSize={Math.min(w, h)}
                      className="text-gray-800 dark:text-gray-200 font-medium"
                    />
                  ) : isBarcodeEl(el) ? (
                    <div className="flex items-center justify-center h-full">
                      <span className="font-mono text-xs font-semibold">[{getDisplayBarcode(el)}]</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <span className="text-xs font-medium">LINE</span>
                    </div>
                  )}
                </div>

                {/* Enhanced selection handles with better positioning */}
                {selected && (
                  <>
                    {/* Corner handles - positioned for better grab area */}
                    {(['nw', 'ne', 'se', 'sw'] as Handle[]).map(handle => (
                      <ResizeHandle
                        key={handle}
                        type="corner"
                        position={handle}
                        onMouseDown={(e) => startInteraction(e, i, handle)}
                        onTouchStart={(e) => startInteraction(e, i, handle)}
                        style={{
                          left: handle.includes('w') ? -12 : w - 12,
                          top: handle.includes('n') ? -12 : h - 12,
                          zIndex: 20,
                        }}
                      />
                    ))}
                    
                    {/* Edge handles - better positioning for sides */}
                    {(['n', 's', 'e', 'w'] as Handle[]).map(handle => {
                      const isHorizontal = handle === 'n' || handle === 's';
                      const isVertical = handle === 'e' || handle === 'w';
                      
                      return (
                        <ResizeHandle
                          key={handle}
                          type="edge"
                          position={handle}
                          onMouseDown={(e) => startInteraction(e, i, handle)}
                          onTouchStart={(e) => startInteraction(e, i, handle)}
                          style={{
                            left: handle === 'w' ? -10 : handle === 'e' ? w - 10 : w/2 - 10,
                            top: handle === 'n' ? -10 : handle === 's' ? h - 10 : h/2 - 10,
                            zIndex: 15,
                            // Make edge handles slightly rectangular for better visual feedback
                            ...(isHorizontal && { width: Math.min(w * 0.3, 40) }),
                            ...(isVertical && { height: Math.min(h * 0.3, 40) }),
                          }}
                        />
                      );
                    })}

                    {/* Move handle (center) - only show if element is large enough */}
                    {(w > 60 && h > 60) && (
                      <ResizeHandle
                        type="move"
                        position="move"
                        onMouseDown={(e) => startInteraction(e, i, 'move')}
                        onTouchStart={(e) => startInteraction(e, i, 'move')}
                        style={{
                          left: w/2 - 14,
                          top: h/2 - 14,
                          zIndex: 10,
                        }}
                      />
                    )}
                    
                    {/* Enhanced delete button */}
                    <div
                      className="absolute bg-destructive text-destructive-foreground rounded-full flex items-center justify-center cursor-pointer hover:scale-125 active:scale-110 transition-all duration-200 text-xs font-bold shadow-lg border-2 border-background"
                      style={{
                        width: 20, height: 20,
                        right: -10,
                        top: -10,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = structuredClone(template!) as LabelTemplate;
                        next.layout!.elements.splice(i, 1);
                        onChangeTemplate(next);
                        setSel(null);
                        onSelectElement?.(null);
                      }}
                      title="Delete element (Delete key)"
                    >
                      ×
                    </div>
                  </>
                )}
              </div>
            );
          })}
          
          {/* Snap guides overlay */}
          <SnapGuides 
            visible={showSnapGuides}
            guides={snapGuides}
            scale={scale}
            canvasSize={{ width: size.w, height: size.h }}
          />
          
          {/* Measurement tooltip */}
          <MeasurementTooltip
            visible={showMeasurements}
            position={measurementPos}
            measurements={measurements}
            scale={scale}
          />
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
    const w = el.maxWidth ?? (el.w ?? Math.max(80, 30));
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
    return { x: Math.min(el.x, el.x2 ?? el.x), y: Math.min(el.y, el.y2 ?? el.y), w, h };
  }
  // Fallback
  return { x, y, w: 80, h: 30 };
}

function clampInside(el: ZPLElement, width: number, height: number) {
  const rect = elementRect(el);
  
  // Clamp position ensuring element doesn't go beyond canvas boundaries
  el.x = Math.max(0, Math.min(width - rect.w, el.x ?? 0));
  el.y = Math.max(0, Math.min(height - rect.h, el.y ?? 0));
  
  // Clamp element dimensions to fit within canvas
  if (isTextEl(el)) {
    const maxW = width - (el.x ?? 0);
    const maxH = height - (el.y ?? 0);
    if (el.w && el.w > maxW) el.w = maxW;
    if (el.h && el.h > maxH) el.h = maxH;
    if (el.maxWidth && el.maxWidth > maxW) el.maxWidth = maxW;
  }
  
  if (isBarcodeEl(el)) {
    const maxW = width - (el.x ?? 0);
    const maxH = height - (el.y ?? 0);
    const maxModuleWidth = maxW / 60; // Approximate modules per barcode
    if (el.moduleWidth && el.moduleWidth > maxModuleWidth) {
      el.moduleWidth = Math.max(1, maxModuleWidth);
    }
    if (el.height && el.height > maxH) el.height = maxH;
  }
  
  if (isLineEl(el)) {
    const x1 = el.x ?? 0;
    const y1 = el.y ?? 0;
    const x2 = el.x2 ?? x1;
    const y2 = el.y2 ?? y1;
    
    el.x2 = Math.max(0, Math.min(width, x2));
    el.y2 = Math.max(0, Math.min(height, y2));
  }
}

function handleCursor(h: Handle) {
  switch (h) {
    case 'n': return 'n-resize';
    case 's': return 's-resize';
    case 'e': return 'e-resize';
    case 'w': return 'w-resize';
    case 'nw': return 'nw-resize';
    case 'ne': return 'ne-resize';
    case 'sw': return 'sw-resize';
    case 'se': return 'se-resize';
    default: return 'move';
  }
}