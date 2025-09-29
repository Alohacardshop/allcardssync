# Unified Print Bridge

The application now uses a unified print bridge system that consolidates the functionality of both `rollo-local-bridge` and `local-print-bridge` into a single, consistent interface.

## Architecture

- **Unified Interface**: Single `UnifiedPrintBridge` class handles both Zebra (ZPL) and Rollo (TSPL) printers
- **Configuration-Based**: Printer type determined by configuration, not separate services
- **Consistent API**: Same interface for all printer types with automatic protocol handling

## Configuration

### Zebra Printers (ZPL)
```typescript
const zebraConfig: PrintBridgeConfig = {
  type: 'zebra',
  host: 'localhost',    // Bridge host (default: localhost)
  port: 3001,          // Bridge port (default: 3001)  
  printerIp: '192.168.1.100',  // Printer IP address
  printerPort: 9100    // Printer port (default: 9100)
};
```

### Rollo Printers (TSPL)
```typescript
const rolloConfig: PrintBridgeConfig = {
  type: 'rollo',
  host: 'localhost',     // Bridge host (default: localhost)
  port: 17777,          // Bridge port (default: 17777)
  printerName: 'Rollo X1038'  // Printer name
};
```

## Usage

### Basic Printing
```typescript
import { unifiedPrintBridge } from '@/lib/print/unified-bridge';

// Print to Zebra printer
const result = await unifiedPrintBridge.print({
  data: '^XA^FO50,50^FDHello World^FS^XZ', // ZPL commands
  copies: 2,
  config: zebraConfig
});

// Print to Rollo printer  
const result = await unifiedPrintBridge.print({
  data: 'SIZE 2,1\nTEXT 10,20,"0",0,1,1,"Hello World"\nPRINT 1', // TSPL commands
  copies: 1,
  config: rolloConfig
});
```

### Connection Testing
```typescript
// Test Zebra connection
const zebraResult = await unifiedPrintBridge.testConnection(zebraConfig);

// Test Rollo connection
const rolloResult = await unifiedPrintBridge.testConnection(rolloConfig);
```

## Bridge Services Setup

### Zebra Bridge (Port 3001)
The `local-print-bridge` handles ZPL printing to Zebra printers via TCP.

**Endpoints:**
- `POST /print` - Send ZPL to printer
- `POST /test` - Test printer connection
- `GET /status` - Bridge health check

### Rollo Bridge (Port 17777)  
The `rollo-local-bridge` handles TSPL printing to Rollo printers.

**Endpoints:**
- `POST /print` - Send TSPL to printer
- `GET /printers` - List available printers

## CORS Configuration

Both bridges are configured to allow cross-origin requests from:
- `localhost` (all ports)
- `127.0.0.1` (all ports)
- Local development servers

## Port Configuration

| Service | Default Port | Environment Variable | Notes |
|---------|--------------|---------------------|--------|
| Zebra Bridge | 3001 | `PORT` | Handles ZPL via TCP |
| Rollo Bridge | 17777 | `PORT` | Handles TSPL via system printers |

## Security Notes

- Both bridges only accept connections from localhost/127.0.0.1
- No authentication required (intended for local use only)
- Raw printer commands are passed through without validation
- Ensure printer drivers are properly installed

## Troubleshooting

### Bridge Connection Issues
1. Verify the bridge service is running on the expected port
2. Check that no firewall is blocking the bridge ports
3. Ensure the bridge has proper permissions to access printers

### Zebra Printer Issues
1. Verify printer IP address and port (usually 9100)
2. Test TCP connection to printer directly
3. Check that printer is on the same network

### Rollo Printer Issues
1. Verify printer drivers are installed
2. Check that printer appears in system printer list
3. Test printing from system print dialog

## Migration from Separate Bridges

If migrating from separate bridge implementations:

1. **Update Import Statements**:
   ```typescript
   // Old
   import { localPrintBridge } from './local-print-bridge';
   import { rolloPrintBridge } from './rollo-local-bridge';
   
   // New
   import { unifiedPrintBridge } from '@/lib/print/unified-bridge';
   ```

2. **Update Configuration**:
   - Convert printer-specific configs to unified `PrintBridgeConfig`
   - Specify printer `type` field ('zebra' or 'rollo')

3. **Update Print Calls**:
   - Use single `print()` method with configuration
   - Handle results consistently across printer types

The unified bridge maintains backward compatibility while providing a cleaner, more maintainable interface.