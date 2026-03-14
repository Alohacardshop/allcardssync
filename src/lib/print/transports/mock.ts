/**
 * Mock Transport — logs ZPL to console, always succeeds.
 * Use in development before a real Zebra printer is installed.
 *
 * Enable: set VITE_PRINT_TRANSPORT=mock in .env
 *
 * Optional: downloads .zpl debug files when VITE_PRINT_MOCK_DOWNLOAD=true
 */
import { logger } from '@/lib/logger';
import type { PrintTransport } from './types';

const MOCK_LATENCY_MS = 150; // simulate realistic printer latency

function downloadZplFile(zpl: string) {
  try {
    const blob = new Blob([zpl], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `label-${Date.now()}.zpl`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    // silently fail — this is a debug convenience only
  }
}

export const mockTransport: PrintTransport = async (payload) => {
  const labelCount = (payload.match(/\^XA/g) || []).length;
  const ts = new Date().toISOString();

  // Simulate printer processing time
  await new Promise((r) => setTimeout(r, MOCK_LATENCY_MS));

  // Structured console output — unmistakably mock
  console.group(
    `%c🖨️ MOCK PRINT [${ts}] — ${labelCount} label(s), ${payload.length} bytes`,
    'background: #14532d; color: #4ade80; font-weight: bold; font-size: 13px; padding: 2px 6px; border-radius: 3px'
  );
  console.log('%c⚠ No physical printer — this is a simulated print.', 'color: #facc15; font-weight: bold');
  console.log(payload);
  console.groupEnd();

  logger.info('[mock-transport] ✅ MOCK print succeeded (no hardware)', {
    labelCount,
    payloadBytes: payload.length,
    timestamp: ts,
  }, 'print-transport');

  // Optional: download .zpl file for offline inspection
  if (import.meta.env.VITE_PRINT_MOCK_DOWNLOAD === 'true') {
    downloadZplFile(payload);
  }
};
