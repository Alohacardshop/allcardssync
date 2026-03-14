/**
 * Transport Factory
 *
 * Reads VITE_PRINT_TRANSPORT from env to pick the active transport.
 *   - "mock"    → logs ZPL to console (default in dev when no value set)
 *   - "qz-tray" → sends ZPL via QZ Tray to the configured printer
 *
 * Adding a new transport later: create the file, add a case here.
 */
import { logger } from '@/lib/logger';
import type { PrintTransport, TransportMode } from './types';

export type { PrintTransport, TransportMode } from './types';

function resolveMode(): TransportMode {
  const env = import.meta.env.VITE_PRINT_TRANSPORT as string | undefined;

  if (env === 'qz-tray') return 'qz-tray';
  if (env === 'mock') return 'mock';

  // Default: mock in dev, qz-tray in prod
  const fallback: TransportMode = import.meta.env.DEV ? 'mock' : 'qz-tray';
  return fallback;
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
    const { qzTrayTransport } = await import('./qzTray');
    transport = qzTrayTransport;
  }

  cached = { mode, transport };

  logger.info(`Print transport initialized: ${mode}`, undefined, 'print-transport');

  return transport;
}
