/**
 * Transport Factory
 *
 * Uses getPrintEnvConfig() as the single source of truth for mode selection.
 *
 *   "mock" → logs ZPL to console (default in dev)
 *   "tcp"  → sends ZPL to Zebra via QZ Tray on port 9100 (default in prod)
 *
 * Adding a new transport later: create the file, add a case here.
 */
import { logger } from '@/lib/logger';
import { getPrintEnvConfig } from '../envConfig';
import type { PrintTransport, TransportMode } from './types';

export type { PrintTransport, TransportMode, PrinterConfig, PrintRequest, PrintResult, PrintJobStatus, PrinterStatus } from './types';

let cached: { mode: TransportMode; transport: PrintTransport } | null = null;

export function getTransportMode(): TransportMode {
  return cached?.mode ?? getPrintEnvConfig().mode;
}

export async function getTransport(): Promise<PrintTransport> {
  if (cached) return cached.transport;

  const { mode } = getPrintEnvConfig();
  let transport: PrintTransport;

  if (mode === 'mock') {
    const { mockTransport } = await import('./mock');
    transport = mockTransport;
  } else {
    const { qzTrayTransport } = await import('./qzTray');
    transport = qzTrayTransport;
  }

  cached = { mode, transport };
  logger.info(`Print transport initialized: ${mode}`, undefined, 'print-transport');

  return transport;
}
