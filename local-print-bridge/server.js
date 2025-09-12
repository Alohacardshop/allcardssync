/**
 * Simple Local Print Bridge
 * Handles ZPL printing to Zebra printers via TCP
 */

const express = require('express');
const cors = require('cors');
const net = require('net');

const app = express();
const PORT = 3001;

// Enable CORS for all origins
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/status', (req, res) => {
  res.json({ 
    status: 'running',
    service: 'Local Print Bridge',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Print endpoint
app.post('/print', async (req, res) => {
  const { zpl, printerIp, printerPort = 9100, copies = 1 } = req.body;

  if (!zpl || !printerIp) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: zpl, printerIp'
    });
  }

  try {
    console.log(`Printing ${copies} label(s) to ${printerIp}:${printerPort}`);
    
    // Prepare ZPL with copies
    const finalZPL = copies > 1 ? zpl.repeat(copies) : zpl;
    
    // Create TCP connection to printer
    const client = new net.Socket();
    
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.destroy();
        reject(new Error('Connection timeout'));
      }, 10000);

      client.connect(printerPort, printerIp, () => {
        clearTimeout(timeout);
        console.log(`Connected to printer ${printerIp}:${printerPort}`);
        
        // Send ZPL data
        client.write(finalZPL, 'utf8', () => {
          console.log('ZPL data sent successfully');
          client.end();
          resolve();
        });
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        console.error('Printer connection error:', err.message);
        reject(err);
      });

      client.on('close', () => {
        console.log('Connection to printer closed');
      });
    });

    res.json({
      success: true,
      message: `Successfully sent ${copies} label(s) to printer`,
      printer: `${printerIp}:${printerPort}`
    });

  } catch (error) {
    console.error('Print error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: `Failed to print to ${printerIp}:${printerPort}`
    });
  }
});

// Test printer connection
app.post('/test', async (req, res) => {
  const { printerIp, printerPort = 9100 } = req.body;

  if (!printerIp) {
    return res.status(400).json({
      success: false,
      error: 'Missing printerIp'
    });
  }

  try {
    const client = new net.Socket();
    
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.destroy();
        reject(new Error('Connection timeout'));
      }, 5000);

      client.connect(printerPort, printerIp, () => {
        clearTimeout(timeout);
        client.end();
        resolve();
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    res.json({
      success: true,
      message: `Printer ${printerIp}:${printerPort} is reachable`
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      details: `Cannot reach printer ${printerIp}:${printerPort}`
    });
  }
});

app.listen(PORT, () => {
  console.log(`🖨️  Local Print Bridge running on http://localhost:${PORT}`);
  console.log('Ready to handle ZPL print jobs');
});