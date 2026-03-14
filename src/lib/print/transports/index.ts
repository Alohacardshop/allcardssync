/**
 * Transport Factory
 *
 * Reads VITE_PRINT_TRANSPORT from env to pick the active transport.
 *
 *   "mock"    → logs ZPL to console (default in dev)
 *   "tcp"     → sends ZPL to Zebra via QZ Tray on port 9100 (default in prod)
 *   "qz-tray" → alias for "tcp"
 *
 * Adding a new transport later: create the file, add a case here.
 */
import { logger } from '@/lib/logger';
import type { PrintTransport, TransportMode } from './types';

export type { PrintTransport, TransportMode, PrinterConfig, PrintRequest, PrintResult, PrintJobStatus, PrinterStatus } from './types';

/** Resolve which transport to use from env + defaults. */
function resolveMode(): TransportMode {
  const env = (import.meta.env.VITE_PRINT_TRANSPORT as string | undefined)?.trim().toLowerCase();

  if (env === 'tcp' || env === 'qz-tray') return 'tcp';
  if (env === 'mock') return 'mock';

  // Default: mock in dev, tcp in prod
  return import.meta.env.DEV ? 'mock' : 'tcp';
}

let cached: { mode: TransportMode; transport: PrintTransport } | null = null;

export function getTransportMode(): TransportMode {
  return cached?.mode ?? resolveMode();
}

export async function getTransport(): Promise<PrintTransport> {
  if (cached) return cached.transport;

  const mode = resolveMode();
  let transport: PrintTransport;

  if (mode === 'mock') {
    const { mockTransport } = await import('./mock');
    transport = mockTransport;
  } else {
    // 'tcp' and 'qz-tray' both resolve to QZ Tray (which sends over TCP/9100)
    const { qzTrayTransport } = await import('./qzTray');
    transport = qzTrayTransport;
  }

  cached = { mode, transport };
  logger.info(`Print transport initialized: ${mode}`, undefined, 'print-transport');

  return transport;
}
