# QZ Tray Printing Integration

This application uses [QZ Tray](https://qz.io/) for direct printing to thermal label printers (Zebra, Rollo, etc.) via ZPL/TSPL commands.

## What is QZ Tray?

QZ Tray is a small background application that runs on your computer and enables web applications to communicate directly with printers. It bridges the gap between browser security restrictions and hardware access.

## Installation

### Download QZ Tray

1. Visit [https://qz.io/download/](https://qz.io/download/)
2. Download the installer for your operating system:
   - **Windows**: `qz-tray-2.x.x.exe`
   - **macOS**: `qz-tray-2.x.x.pkg`
   - **Linux**: `qz-tray-2.x.x.run`

### Install

#### Windows
1. Run the `.exe` installer
2. Follow the installation wizard
3. QZ Tray will start automatically and appear in the system tray

#### macOS
1. Open the `.pkg` file
2. Follow the installation steps
3. Grant necessary permissions when prompted
4. QZ Tray will appear in the menu bar

#### Linux
1. Make the installer executable: `chmod +x qz-tray-2.x.x.run`
2. Run: `./qz-tray-2.x.x.run`
3. QZ Tray will start as a background service

## First-Time Setup

When you first connect from the web application:

1. **Trust Dialog**: QZ Tray will show a security prompt asking if you trust this website
2. **Click "Allow"** (or "Remember this decision" + "Allow" to skip future prompts)
3. The connection will be established

### Certificate Trust (Optional)

For production deployments, you can install a trusted certificate to avoid the permission dialog:
- See [QZ Tray documentation on signing](https://qz.io/wiki/code-signing)

## Connecting Printers

### USB Printers
1. Connect your Zebra/thermal printer via USB
2. Install the manufacturer's printer driver
3. The printer should appear in QZ Tray's printer list

### Network/Wi-Fi Printers
1. Ensure the printer is on the same network
2. Configure the printer's network settings (via LCD panel or configuration)
3. Install the printer driver on your computer
4. Add the network printer in your OS's printer settings
5. The printer will appear in QZ Tray

### Zebra-Specific Setup
- Zebra ZD410, ZD420, ZD620, etc. work great with raw ZPL
- Ensure the printer is in ZPL mode (not EPL)
- Default ZPL port is 9100 for network printers

## Using in the App

### Quick Start

1. **Install QZ Tray** on your computer (see above)
2. **Start QZ Tray** (should auto-start after installation)
3. **Open the test page**: Navigate to `/qz-tray-test` in the application
4. **Click "Connect to QZ Tray"**
5. **Select your printer** from the dropdown
6. **Click "Print Test Label"** to verify

### From the Barcode Tab

1. Ensure QZ Tray is connected (green status indicator)
2. Select your printer in the printer dropdown
3. Select items to print
4. Click "Print Selected"

## Troubleshooting

### "Cannot connect to QZ Tray"

**Cause**: QZ Tray is not running or not installed.

**Solution**:
1. Check if QZ Tray is in your system tray (Windows) or menu bar (macOS)
2. If not, start QZ Tray from your applications
3. If not installed, download from [qz.io/download](https://qz.io/download/)

### "No printers found"

**Cause**: No printers are installed or connected.

**Solution**:
1. Verify your printer is connected (USB cable or network)
2. Check that printer drivers are installed
3. Verify the printer appears in your OS's printer settings
4. Click the refresh button to rescan

### "Print failed"

**Cause**: Various issues with printer communication.

**Solutions**:
1. Verify the printer is powered on and ready
2. Check for paper jams or media issues
3. Ensure the printer is in the correct mode (ZPL for Zebra)
4. Try restarting the printer
5. Check the printer's LCD for error messages

### Trust Dialog Keeps Appearing

**Cause**: Certificate not trusted or "Remember" not checked.

**Solution**:
1. When the trust dialog appears, check "Remember this decision"
2. Click "Allow"
3. For permanent solution, deploy a signed certificate

### Printer Not Listed

**Cause**: Printer driver not installed or printer offline.

**Solution**:
1. Install the manufacturer's printer driver
2. Verify printer appears in Windows Printers or macOS Printers & Scanners
3. Check printer is online (no offline status)
4. Restart QZ Tray

## ZPL Reference

### Sample Test Label

```zpl
^XA
^FO50,50^ADN,36,20^FDHello World^FS
^FO50,100^BCN,80,Y,N,N
^FD1234567890^FS
^XZ
```

### Common ZPL Commands

| Command | Description |
|---------|-------------|
| `^XA` | Start label format |
| `^XZ` | End label format |
| `^FO` | Field origin (x,y position) |
| `^FD` | Field data |
| `^FS` | Field separator (end of field) |
| `^ADN` | Font A, normal orientation |
| `^BCN` | Code 128 barcode |
| `^PQ` | Print quantity |

### Testing ZPL

Use [Labelary](http://labelary.com/viewer.html) to preview ZPL code before printing.

## Architecture

```
┌─────────────────────┐
│    React App        │
│  (Browser)          │
└─────────┬───────────┘
          │ WebSocket
          ▼
┌─────────────────────┐
│    QZ Tray          │
│  (Background App)   │
└─────────┬───────────┘
          │ Print Driver / TCP
          ▼
┌─────────────────────┐
│   Zebra Printer     │
│  (USB or Network)   │
└─────────────────────┘
```

## Security Notes

- QZ Tray only accepts connections from approved origins
- The trust dialog prevents unauthorized access
- All communication is local (no cloud servers)
- For production, deploy a signed certificate

## Support

- [QZ Tray Documentation](https://qz.io/wiki/)
- [QZ Tray GitHub Issues](https://github.com/qzind/tray/issues)
- [Zebra ZPL Programming Guide](https://www.zebra.com/us/en/support-downloads/knowledge-articles/ait/zpl-command-information-and-details.html)
