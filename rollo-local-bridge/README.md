# Rollo Local Bridge

A lightweight Node.js server that enables web applications to print directly to thermal printers using TSPL commands.

## Installation

1. Install Node.js (v16 or higher)
2. Clone/download this project
3. Run: `npm install`
4. Start: `npm start`

The bridge will listen on `http://127.0.0.1:17777`

## API Endpoints

### GET /printers
Returns list of available printers:
```json
[
  {
    "name": "Rollo X1038",
    "status": "idle",
    "isDefault": true
  }
]
```

### POST /print
Send TSPL data to printer:
- **Body**: Raw TSPL commands (text/plain)
- **Query params**:
  - `printerName` (optional): Target printer name
  - `copies` (optional): Number of copies (default: 1)

Example:
```bash
curl -X POST "http://127.0.0.1:17777/print?printerName=Rollo%20X1038&copies=2" \
  -H "Content-Type: text/plain" \
  -d "SIZE 2,1
GAP 0,0
DENSITY 10
SPEED 4
DIRECTION 1
REFERENCE 0,0
CLS
TEXT 10,20,\"0\",0,1,1,\"TEST LABEL\"
PRINT 1"
```

## Auto-Start Setup

### Windows (Task Scheduler)
1. Open Task Scheduler
2. Create Basic Task:
   - **Name**: Rollo Local Bridge
   - **Trigger**: At log on
   - **Action**: Start a program
   - **Program**: `node`
   - **Arguments**: `C:\path\to\rollo-local-bridge\server.js`
   - **Start in**: `C:\path\to\rollo-local-bridge`
3. Check "Run with highest privileges"

### macOS (LaunchAgent)
Create `~/Library/LaunchAgents/com.alohacardshop.rollo-bridge.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.alohacardshop.rollo-bridge</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/rollo-local-bridge/server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/rollo-local-bridge</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

Load with: `launchctl load ~/Library/LaunchAgents/com.alohacardshop.rollo-bridge.plist`

### Linux (systemd)
Create `/etc/systemd/user/rollo-bridge.service`:
```ini
[Unit]
Description=Rollo Local Bridge
After=network.target

[Service]
Type=simple
User=%i
WorkingDirectory=/path/to/rollo-local-bridge
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
```

Enable: `systemctl --user enable rollo-bridge.service`

## Troubleshooting

1. **Bridge offline**: Check if Node.js is running and no firewall blocks port 17777
2. **No printers found**: Verify printer drivers are installed and printer is connected
3. **Print jobs stuck**: Restart the bridge service
4. **Permission errors**: Run with appropriate user privileges
5. **Port conflicts**: Change PORT environment variable

## Security Notes

- Bridge only accepts connections from localhost (127.0.0.1)
- CORS enabled for local development ports
- No authentication required (intended for local use only)