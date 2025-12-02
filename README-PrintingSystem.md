# Unified Printing System Documentation

## Overview
This system standardizes all printing on Zebra ZD410 + ZPL via a local TCP bridge running on `localhost:17777`.

## Architecture

### Transport Layer
- **Local Bridge**: All printing routes through `http://localhost:17777`
- **Endpoint**: `/rawtcp` for sending raw ZPL to printers
- **No Cloud Dependencies**: Direct local TCP connection to printers

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

### Printer Service
- **Location**: `src/lib/printer/zebraService.ts`
- **Functions**:
  - `print(zpl, ip?, port?)` - Send ZPL to printer
  - `testConnection(ip, port?)` - Test printer connectivity
  - `checkBridgeStatus()` - Verify local bridge is running
  - `getConfig()` / `saveConfig()` - Manage printer settings

### Local Bridge Requirements
The local print bridge must be running on port 17777. It accepts:
- `POST /rawtcp` - Send raw data to printer (body: `{ host, port, data }`)
- `GET /status` - Check bridge health

### Configuration
- **Storage**: localStorage key `zebra-printer-config`
- **Settings**: Printer IP, port, speed, darkness
- **Persistence**: Saved automatically when changed

## Usage Examples

### Label Designer
```typescript
const zplCode = generateZPLFromElements(label, xOffset, yOffset, {
  speed: stockConfig.speed,
  darkness: stockConfig.darkness,
  copies
});
await zebraService.print(zplCode);
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
await zebraService.print(zpl);
```

## File Structure

```
src/lib/printer/
├── zebraService.ts      # Main printer service (bridge communication)
├── index.ts             # Module exports

src/lib/print/
├── queueInstance.ts     # Print queue with local bridge transport

src/components/
├── PrinterSettings.tsx  # Printer configuration UI
```

## Migration Notes
- All cloud/edge function printing removed
- Single transport method via local bridge
- No PrintNode or external service dependencies
