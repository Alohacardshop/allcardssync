# Unified Printing System Documentation

## Overview
This system standardizes all printing on Zebra ZD410 + ZPL with PrintCloud (PrintNode) transport.

## Architecture

### Single ZPL Builder
- **Function**: `generateZPLFromElements(label, xOffset, yOffset, options?)`
- **Location**: `src/lib/zplElements.ts`
- **Used by**: Label Designer, Inventory, all print functions

### ZD410 Header Template
```zpl
^XA                    ; Start format
^MTD                   ; ZD410 = Direct Thermal
^MNY or ^MNN           ; Stock mode (Gap/Notch or Continuous)
^MMC                   ; Enable cutter mode for ZD410
^PW{widthDots}         ; Print width in dots
^LL{heightDots}        ; Label length in dots
^LH0,0                 ; Label home position
^LS16                  ; Small right shift to avoid left-clip
^FWN                   ; Force normal field orientation
^PON                   ; Normal print orientation
^CI28                  ; UTF-8 character set
^PR{speed}             ; Print speed (optional)
^MD{darkness}          ; Media darkness (optional)
...elements...
^PQ{copies},1,0,Y      ; Print quantity with cut after each
^XZ                    ; End format
```

### Stock Modes

#### Gap/Notch Mode (Default)
- Command: `^MNY`
- For labels with gaps or notches between them
- Most common for die-cut labels

#### Continuous Mode
- Command: `^MNN` + `^LL{heightDots}`
- For continuous stock without gaps
- Requires label length specification

### Element Rules
- **Global Offsets**: xOffset/yOffset applied to all `^FO` positions
- **Text**: Default to `^AN` (non-rotated) unless rotation requested
- **Barcodes**: Use `^BCN` (non-rotated) or `^BCR` (rotated)
- **Padding**: 8-12 dots above/below barcodes for HRI text

### Transport Layer
- **Single Service**: `print(zpl, copies)` in `src/lib/printService.ts`
- **Transport**: PrintNode only (no direct TCP/HTTP)
- **Encoding**: UTF-8 base64 using TextEncoder
- **Error Handling**: Clear failures, no silent fallbacks

### Configuration
- **Storage**: localStorage key `zebra-stock-config`
- **Settings**: Stock mode, speed (2-6 IPS), darkness (0-30)
- **Persistence**: Saved automatically when changed

## Usage Examples

### Label Designer
```typescript
const zplCode = generateZPLFromElements(label, xOffset, yOffset, {
  speed: stockConfig.speed,
  darkness: stockConfig.darkness,
  copies
});
await print(zplCode, copies);
```

### Inventory
```typescript
const label = {
  width: 448,   // 2" @ 203dpi
  height: 203,  // 1" @ 203dpi
  dpi: 203,
  elements: [
    { type: 'text', position: { x: 40, y: 32 }, font: 'A', fontSize: 26, text: title },
    { type: 'barcode', position: { x: 40, y: 88 }, data: sku, height: 80 }
  ]
};
const zpl = generateZPLFromElements(label, 0, 0);
await print(zpl, 1);
```

## Migration Notes
- Removed `simpleZPLTemplates.ts` (legacy)
- All `zebraNetworkService.printZPL` calls replaced with unified `print()`
- Designer consolidated to single "Print Current Label" button
- Inventory uses same builder as Designer for consistent output