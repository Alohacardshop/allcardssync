# Zebra Print Bridge - Installation Guide

## Quick Start (End Users)

### Option 1: Simple Run
1. Download `ZebraPrintBridge.exe`
2. Double-click to run
3. Keep the window open while using the dashboard

### Option 2: Auto-Start with Windows
1. Download `ZebraPrintBridge.exe`
2. Press `Win + R`, type `shell:startup`, press Enter
3. Copy `ZebraPrintBridge.exe` into that folder
4. The bridge will now start automatically when Windows boots

---

## For Developers: Building the EXE

### Prerequisites
- Node.js 18+ installed
- npm or yarn

### Build Steps

```bash
# Navigate to the bridge folder
cd rollo-local-bridge

# Install dependencies
npm install

# Build the standalone exe
npm run build
```

This creates `ZebraPrintBridge.exe` (~50MB) in the current folder.

### Build for All Platforms
```bash
npm run build-all
```
Creates executables in `dist/` folder for:
- Windows (x64)
- macOS (x64)
- Linux (x64)

---

## Verifying Installation

1. Run the bridge (double-click exe or `npm start`)
2. Open a browser and go to: `http://localhost:17777`
3. You should see:
```json
{
  "service": "Zebra Network Bridge",
  "status": "running",
  "endpoints": [...]
}
```

---

## Troubleshooting

### "Port 17777 already in use"
Another instance is running. Check Task Manager and end any `ZebraPrintBridge.exe` processes.

### "Windows Firewall blocked this app"
Click "Allow access" when prompted. The bridge only listens on localhost (127.0.0.1) and cannot be accessed from other computers.

### Printer not found
1. Ensure printer is connected via USB or on the same network
2. For network printers: verify IP address is correct in dashboard settings
3. For USB printers: check Windows recognizes the printer in Devices

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check and endpoint list |
| `/system-printers` | GET | List locally connected printers |
| `/system-print` | POST | Print to USB printer |
| `/rawtcp` | POST | Print to network printer via TCP |
| `/check-tcp` | GET | Test network printer connection |
| `/ping` | GET | Ping network device |
