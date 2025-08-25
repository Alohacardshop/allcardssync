# Rollo Local Bridge - IT Setup Guide

This guide helps IT teams deploy the Rollo Local Bridge for seamless thermal label printing in web applications.

## Overview

The Rollo Local Bridge is a lightweight Node.js service that enables web browsers to send print jobs directly to thermal printers using TSPL (Thermal Printer Programming Language) commands.

## Prerequisites

- **Rollo Thermal Printer** (X1038, X1040, or compatible TSPL printer)
- **Computer** running Windows 10+, macOS 10.15+, or Linux
- **Node.js** v16 or higher
- **USB Cable** (provided with printer)

## Step 1: Install Rollo Printer Driver

### Windows
1. Download the latest driver from [Rollo's website](https://www.rolloprinter.com/support/)
2. Connect the printer via USB before installing
3. Run the installer as Administrator
4. Set paper size to **2" x 1"** (or 50mm x 25mm)
5. Set print quality to **203 DPI**
6. Test print a page to verify installation

### macOS
1. Connect printer via USB
2. Go to **System Preferences → Printers & Scanners**
3. Click **+** to add printer
4. Select the Rollo printer
5. Set **Paper Size** to **2" x 1"** in printer preferences
6. Set print quality to **203 DPI**

### Linux
1. Install CUPS: `sudo apt-get install cups`
2. Add user to `lpadmin` group: `sudo usermod -a -G lpadmin $USER`
3. Access CUPS web interface: http://localhost:631
4. Add printer using "Generic Raw Queue"
5. Configure paper size and quality

## Step 2: Install Node.js Bridge

### Download & Setup
```bash
# Clone or download the rollo-local-bridge folder
cd rollo-local-bridge

# Install dependencies
npm install

# Test the bridge
npm start
```

You should see: `Bridge listening on http://127.0.0.1:17777`

### Verify Bridge Works
Open a web browser and visit: http://127.0.0.1:17777

You should see a JSON response with status "online".

Test printer detection:
```bash
curl http://127.0.0.1:17777/printers
```

Expected response: `["Rollo X1038"]` (or your printer name)

## Step 3: Configure Auto-Start

### Windows (Task Scheduler)
1. Open **Task Scheduler** as Administrator
2. Click **Create Basic Task**
3. **Name**: "Rollo Local Bridge"
4. **Trigger**: "When I log on"
5. **Action**: "Start a program"
6. **Program**: `C:\Program Files\nodejs\node.exe`
7. **Arguments**: `C:\path\to\rollo-local-bridge\server.js`
8. **Start in**: `C:\path\to\rollo-local-bridge`
9. Check **"Run with highest privileges"**
10. Check **"Run whether user is logged on or not"**

### macOS (LaunchAgent)
Create file: `~/Library/LaunchAgents/com.company.rollo-bridge.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.company.rollo-bridge</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/USERNAME/rollo-local-bridge/server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/USERNAME/rollo-local-bridge</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/USERNAME/rollo-bridge.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/USERNAME/rollo-bridge-error.log</string>
</dict>
</plist>
```

Load the service:
```bash
launchctl load ~/Library/LaunchAgents/com.company.rollo-bridge.plist
```

### Linux (systemd)
Create file: `/etc/systemd/user/rollo-bridge.service`

```ini
[Unit]
Description=Rollo Local Bridge
After=network.target

[Service]
Type=simple
User=%i
WorkingDirectory=/home/USERNAME/rollo-local-bridge
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
```

Enable and start:
```bash
systemctl --user enable rollo-bridge.service
systemctl --user start rollo-bridge.service
```

## Step 4: Network & Security Configuration

### Firewall Rules
The bridge runs on `localhost:17777` and only accepts local connections. No firewall changes needed for most setups.

### Endpoint Security Whitelist
If using enterprise endpoint protection, whitelist:
- **Process**: `node.exe` or `node`
- **Network**: `127.0.0.1:17777`
- **File**: `rollo-local-bridge` folder

### Browser Permissions
Modern browsers may block localhost requests from HTTPS sites. For production deployment:
1. Use HTTPS for the web application
2. Consider using a signed certificate for the bridge (advanced)
3. Or deploy both web app and bridge over HTTP in internal networks

## Step 5: Testing & Validation

### Bridge Health Check
```bash
curl http://127.0.0.1:17777/
```
Expected: `{"status":"online","version":"1.0.0","timestamp":"..."}`

### Printer Detection
```bash
curl http://127.0.0.1:17777/printers
```
Expected: Array of printer names

### Test Print
```bash
curl -X POST "http://127.0.0.1:17777/print?printerName=Rollo%20X1038&copies=1" \
  -H "Content-Type: text/plain" \
  -d "SIZE 2,1
GAP 0,0
DENSITY 10
SPEED 4
DIRECTION 1
REFERENCE 0,0
CLS
TEXT 10,20,\"0\",0,1,1,\"TEST PRINT\"
TEXT 10,40,\"0\",0,1,1,\"Bridge Working!\"
PRINT 1"
```

### Web Application Test
1. Open the web application
2. Navigate to the Label Designer
3. Look for "Printer Panel" or "Printer Status"
4. Verify bridge shows as "Online"
5. Select your printer and click "Test Print"

## Troubleshooting

### Bridge Won't Start
- **Check Node.js**: `node --version` (should be v16+)
- **Check dependencies**: `npm install` in bridge folder
- **Check permissions**: Run as Administrator/sudo initially
- **Check port conflicts**: `netstat -an | grep 17777`

### No Printers Found
- **Verify connection**: USB cable securely connected
- **Check drivers**: Print a test page from OS printer settings
- **Restart bridge**: Stop and start the bridge service
- **Check printer status**: Ensure printer is powered on and not in error state

### Print Jobs Stuck/Failed
- **Check paper**: Ensure labels are loaded correctly
- **Check label size**: Must be configured as 2" x 1" in driver
- **Check TSPL format**: Verify commands are valid
- **Restart printer**: Power cycle the printer
- **Check USB**: Try different USB port or cable

### Permission Errors
- **Windows**: Run as Administrator, add user to local admin group
- **macOS**: Check accessibility permissions in Security & Privacy
- **Linux**: Add user to `lp` and `dialout` groups

### Bridge Crashes/Restarts
- **Check logs**: Look at console output or log files
- **Memory issues**: Restart the bridge periodically via cron/task scheduler
- **System resources**: Ensure adequate RAM and CPU

### Web App Can't Connect
- **CORS issues**: Verify the bridge allows the web app's origin
- **HTTPS/HTTP**: Mixed content policies may block requests
- **Network policies**: Corporate firewalls may block localhost
- **Browser cache**: Clear browser cache and reload

## Production Deployment Checklist

- [ ] Rollo driver installed and tested
- [ ] Bridge auto-starts on system boot
- [ ] Test print completes successfully
- [ ] Web application connects to bridge
- [ ] Firewall/security policies configured
- [ ] Monitoring/alerting set up for bridge health
- [ ] Backup plan if bridge fails (fallback to browser print)
- [ ] Documentation provided to end users
- [ ] Support contacts established

## Advanced Configuration

### Multiple Printers
The bridge supports multiple printers automatically. Users can select their preferred printer in the web application.

### Custom Port
Change the port by setting environment variable:
```bash
PORT=18888 npm start
```

### Logging
Enable detailed logging:
```bash
DEBUG=* npm start
```

### SSL/HTTPS (Advanced)
For production environments requiring HTTPS, consider using a reverse proxy with SSL termination.

## Support Contacts

- **IT Helpdesk**: [Your helpdesk contact]
- **Application Support**: [Your app support contact]  
- **Rollo Support**: https://www.rolloprinter.com/support/

## Appendix: TSPL Quick Reference

Common TSPL commands for 2" x 1" labels:

```
SIZE 2,1              // Set label size to 2" x 1"
GAP 0,0              // No gap between labels
DENSITY 10           // Print darkness (0-15)
SPEED 4              // Print speed (2-8)
DIRECTION 1          // Print direction
REFERENCE 0,0        // Set origin point
CLS                  // Clear buffer

TEXT x,y,"0",0,1,1,"text"    // Print text at position
QRCODE x,y,M,4,A,0,"data"    // Print QR code
BAR x,y,width,height         // Print rectangle/line

PRINT 1              // Print one label
```

Coordinate system: (0,0) is top-left, measured in dots at 203 DPI.
- 2 inches = 406 dots
- 1 inch = 203 dots