const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const net = require('net');
const printer = require("printer");

const app = express();

// Always advertise Private Network Access (Chrome)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});

// Allow localhost and Lovable origins
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl/DevTools
    try {
      const host = new URL(origin).host;
      const ok =
        /^localhost(:\d+)?$/i.test(host) ||
        /^127\.0\.0\.1(:\d+)?$/i.test(host) ||
        /(^|\.)lovable(app|dev|project)\.com$/i.test(host);
      cb(null, ok);
    } catch {
      cb(null, false);
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
  optionsSuccessStatus: 204,
}));

// Preflight for everything
app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.sendStatus(204);
});

// Accept raw TSPL as text
app.use(bodyParser.text({ type: ['text/plain', '*/*'], limit: '1mb' }));

app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ status: 'ok', version: 'minimal', time: new Date().toISOString() });
});

// Get list of available printers
app.get("/printers", (req, res) => {
  try {
    const printers = printer.getPrinters();
    const printerNames = printers.map(p => ({
      name: p.name,
      status: p.status || 'unknown',
      isDefault: p.name === printer.getDefaultPrinterName()
    }));
    
    console.log(`[${new Date().toISOString()}] Printers requested: ${printerNames.length} found`);
    res.json(printerNames);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error getting printers:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Print TSPL data
app.post("/print", (req, res) => {
  const data = req.body;
  const printerName = req.query.printerName || printer.getDefaultPrinterName();
  const copies = parseInt(req.query.copies || "1", 10);
  
  if (!data) {
    return res.status(400).json({ error: "No TSPL data provided" });
  }

  if (!printerName) {
    return res.status(400).json({ error: "No printer available" });
  }

  console.log(`[${new Date().toISOString()}] Print job: ${copies} copies to ${printerName}`);
  
  try {
    let jobsSent = 0;
    let errors = [];

    for (let i = 0; i < copies; i++) {
      printer.printDirect({
        data,
        printer: printerName,
        type: "RAW",
        success: (jobID) => {
          jobsSent++;
          console.log(`[${new Date().toISOString()}] Job ${i + 1}/${copies} sent successfully, ID: ${jobID}`);
          
          // Send response after all jobs are processed
          if (jobsSent + errors.length === copies) {
            if (errors.length === 0) {
              res.json({ 
                success: true, 
                jobsSent,
                message: `${jobsSent} print job(s) sent successfully`
              });
            } else {
              res.status(207).json({
                success: false,
                jobsSent,
                errors,
                message: `${jobsSent}/${copies} jobs sent, ${errors.length} failed`
              });
            }
          }
        },
        error: (err) => {
          const errorMsg = `Job ${i + 1}/${copies} failed: ${err}`;
          errors.push(errorMsg);
          console.error(`[${new Date().toISOString()}] ${errorMsg}`);
          
          // Send response after all jobs are processed
          if (jobsSent + errors.length === copies) {
            res.status(500).json({
              success: false,
              jobsSent,
              errors,
              message: `${errors.length}/${copies} jobs failed`
            });
          }
        }
      });
    }
  } catch (e) {
    const errorMsg = `Print error: ${e.message}`;
    console.error(`[${new Date().toISOString()}] ${errorMsg}`);
    res.status(500).json({ error: errorMsg });
  }
});

app.post('/rawtcp', async (req, res) => {
  const data = typeof req.body === 'string' ? req.body : '';
  const ip = (req.query.ip || '192.168.0.248').toString();
  const port = parseInt(req.query.port || '9100', 10);

  if (!data) return res.status(400).json({ error: 'No TSPL data provided' });

  const socket = new net.Socket();
  socket.setTimeout(15000);          // Increased timeout to 15s
  socket.setKeepAlive(true, 3000);

  console.log(`[${new Date().toISOString()}] TCP print to ${ip}:${port}, bytes=${Buffer.byteLength(data, 'utf8')}`);

  try {
    await new Promise((resolve, reject) => {
      socket.once('connect', () => {
        socket.write(data, 'utf8', () => {
          socket.end();
          // Respond immediately after sending data
          res.json({ success: true, message: `TSPL sent to ${ip}:${port}` });
          resolve();
        });
      });
      socket.once('timeout', () => { socket.destroy(new Error('timeout')); });
      socket.once('error', reject);
      socket.connect(port, ip);
    });
  } catch (e) {
    console.error('TCP error:', e.message);
    if (!res.headersSent) {
      res.status(504).json({ error: `TCP ${e.message || 'failure'} — check Raw/JetDirect 9100, IP, and power.` });
    }
  }
});

// Check TCP connectivity endpoint
app.get('/check-tcp', async (req, res) => {
  const ip = (req.query.ip || '192.168.0.248').toString();
  const port = parseInt(req.query.port || '9100', 10);

  const socket = new net.Socket();
  socket.setTimeout(5000);

  try {
    await new Promise((resolve, reject) => {
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('timeout', () => { socket.destroy(new Error('timeout')); });
      socket.once('error', reject);
      socket.connect(port, ip);
    });
    res.json({ ok: true, message: `TCP connection to ${ip}:${port} successful` });
  } catch (e) {
    res.json({ ok: false, error: `TCP connection failed: ${e.message}` });
  }
});

const PORT = process.env.PORT || 17777;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[${new Date().toISOString()}] Rollo Local Bridge listening on http://127.0.0.1:${PORT}`);
  console.log(`Available printers: ${printer.getPrinters().map(p => p.name).join(', ') || 'None'}`);
});