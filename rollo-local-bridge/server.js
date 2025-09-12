const express = require('express');
const net = require('net');
const { execSync, exec } = require('child_process');
const os = require('os');
const app = express();
const port = 17777;

// CORS middleware for browser requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());
app.use(express.text());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Zebra Network Bridge',
    version: '2.0.0',
    endpoints: [
      '/system-printers - Get locally connected printers',
      '/system-print - Print ZPL to system printer', 
      '/rawtcp - Send raw data to network printer',
      '/check-tcp - Test network printer connection'
    ]
  });
});

// Get system printers (USB/locally connected)
app.get('/system-printers', (req, res) => {
  try {
    let printers = [];
    
    if (os.platform() === 'win32') {
      // Windows - use wmic to get printer list
      const command = 'wmic printer get name,status,driverName /format:csv';
      const output = execSync(command, { encoding: 'utf8' });
      
      printers = output.split('\n')
        .slice(1) // Skip header
        .filter(line => line.trim() && !line.startsWith('Node'))
        .map(line => {
          const parts = line.split(',');
          const name = parts[2]?.trim();
          const status = parts[3]?.trim();
          
          if (name && name !== 'Name') {
            return {
              name: name,
              status: status === 'OK' ? 'ready' : 'offline',
              model: 'System Printer',
              driverName: parts[1]?.trim()
            };
          }
          return null;
        })
        .filter(Boolean);
        
    } else if (os.platform() === 'darwin') {
      // macOS - use lpstat to get printer list
      const command = 'lpstat -p';
      const output = execSync(command, { encoding: 'utf8' });
      
      printers = output.split('\n')
        .filter(line => line.startsWith('printer'))
        .map(line => {
          const match = line.match(/printer (.+?) is (.+)/);
          if (match) {
            return {
              name: match[1],
              status: match[2].includes('idle') ? 'ready' : 'offline',
              model: 'System Printer'
            };
          }
          return null;
        })
        .filter(Boolean);
        
    } else {
      // Linux - use lpstat to get printer list  
      const command = 'lpstat -p';
      const output = execSync(command, { encoding: 'utf8' });
      
      printers = output.split('\n')
        .filter(line => line.startsWith('printer'))
        .map(line => {
          const match = line.match(/printer (.+?) is (.+)/);
          if (match) {
            return {
              name: match[1],
              status: match[2].includes('idle') ? 'ready' : 'offline',
              model: 'System Printer'
            };
          }
          return null;
        })
        .filter(Boolean);
    }
    
    res.json({ 
      success: true, 
      printers: printers,
      platform: os.platform()
    });
    
  } catch (error) {
    console.error('Failed to get system printers:', error);
    res.json({ 
      success: false, 
      error: error.message,
      printers: []
    });
  }
});

// Print ZPL to system printer
app.post('/system-print', (req, res) => {
  const { printerName, zplData, copies = 1 } = req.body;
  
  if (!printerName || !zplData) {
    return res.json({ 
      success: false, 
      error: 'Missing printerName or zplData' 
    });
  }
  
  try {
    if (os.platform() === 'win32') {
      // Windows - save ZPL to temp file and print using copy command
      const fs = require('fs');
      const path = require('path');
      const tempFile = path.join(os.tmpdir(), `zpl_${Date.now()}.txt`);
      
      fs.writeFileSync(tempFile, zplData);
      
      for (let i = 0; i < copies; i++) {
        execSync(`copy "${tempFile}" "\\\\${os.hostname()}\\${printerName}"`, { stdio: 'ignore' });
      }
      
      fs.unlinkSync(tempFile);
      
    } else {
      // macOS/Linux - use lpr command
      for (let i = 0; i < copies; i++) {
        const child = exec(`lpr -P "${printerName}" -o raw`, (error) => {
          if (error) {
            console.error('Print error:', error);
          }
        });
        
        child.stdin.write(zplData);
        child.stdin.end();
      }
    }
    
    res.json({ 
      success: true, 
      message: `Sent ${copies} copy(ies) to ${printerName}` 
    });
    
  } catch (error) {
    console.error('System print failed:', error);
    res.json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Send raw data to network printer (TCP/IP)
app.post('/rawtcp', (req, res) => {
  const ip = req.query.ip;
  const port = parseInt(req.query.port) || 9100;
  const data = req.body;

  if (!ip || !data) {
    return res.json({ success: false, error: 'Missing IP or data' });
  }

  const client = new net.Socket();
  
  client.setTimeout(5000);
  
  client.connect(port, ip, () => {
    client.write(data);
    client.end();
  });

  client.on('close', () => {
    res.json({ success: true, message: `Data sent to ${ip}:${port}` });
  });

  client.on('error', (err) => {
    res.json({ success: false, error: err.message });
  });

  client.on('timeout', () => {
    client.destroy();
    res.json({ success: false, error: 'Connection timeout' });
  });
});

// Test TCP connection to network printer
app.get('/check-tcp', (req, res) => {
  const ip = req.query.ip;
  const port = parseInt(req.query.port) || 9100;

  if (!ip) {
    return res.json({ ok: false, error: 'Missing IP' });
  }

  const client = new net.Socket();
  
  client.setTimeout(3000);
  
  client.connect(port, ip, () => {
    client.end();
    res.json({ ok: true });
  });

  client.on('error', () => {
    res.json({ ok: false });
  });

  client.on('timeout', () => {
    client.destroy();
    res.json({ ok: false });
  });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`🖨️  Zebra Network Bridge running on http://127.0.0.1:${port}`);
  console.log(`📡 Supports both USB/system printers and network TCP/IP printers`);
  console.log(`🔗 Endpoints available:`);
  console.log(`   GET  / - Service status and info`);
  console.log(`   GET  /system-printers - List USB/system printers`);
  console.log(`   POST /system-print - Print ZPL to system printer`);
  console.log(`   POST /rawtcp?ip=X&port=Y - Send raw data to network printer`);
  console.log(`   GET  /check-tcp?ip=X&port=Y - Test network printer connection`);
});

module.exports = app;