/**
 * Printer Environment Config
 *
 * Reads printer settings from VITE_ env vars.
 * No database needed — just .env.local for one Zebra ZD611.
 *
 * Env vars:
 *   VITE_PRINTER_MODE        = mock | tcp        (default: mock in dev, tcp in prod)
 *   VITE_ZEBRA_PRINTER_NAME  = "ZDesigner ZD611" (OS printer name for QZ Tray)
 *   VITE_ZEBRA_PRINTER_IP    = "192.168.1.50"    (informational / future direct TCP)
 *   VITE_ZEBRA_PRINTER_PORT  = 9100              (default 9100)
 *   VITE_PRINT_MOCK_DOWNLOAD = true              (optional: save .zpl files in mock mode)
 */

import type { TransportMode } from './transports/types';

// ---------------------------------------------------------------------------
// Resolved config shape
// ---------------------------------------------------------------------------

export interface PrintEnvConfig {
  mode: TransportMode;
  printerName: string | null;
  printerIp: string | null;
  printerPort: number;
  mockDownload: boolean;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ConfigWarning {
  field: string;
  message: string;
}

function validateConfig(config: PrintEnvConfig): ConfigWarning[] {
  const warnings: ConfigWarning[] = [];

  if (config.mode === 'tcp' || config.mode === 'qz-tray') {
    if (!config.printerName) {
      warnings.push({
        field: 'VITE_ZEBRA_PRINTER_NAME',
        message: 'Printer name is required in tcp mode. QZ Tray needs the OS printer name.',
      });
    }
  }

  if (config.printerIp && !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(config.printerIp)) {
    warnings.push({
      field: 'VITE_ZEBRA_PRINTER_IP',
      message: `Invalid IP format: "${config.printerIp}"`,
    });
  }

  if (config.printerPort < 1 || config.printerPort > 65535) {
    warnings.push({
      field: 'VITE_ZEBRA_PRINTER_PORT',
      message: `Port out of range: ${config.printerPort}`,
    });
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseMode(): TransportMode {
  const raw = (import.meta.env.VITE_PRINTER_MODE as string | undefined)?.trim().toLowerCase();

  // Also check legacy VITE_PRINT_TRANSPORT for backward compat
  const legacy = (import.meta.env.VITE_PRINT_TRANSPORT as string | undefined)?.trim().toLowerCase();
  const value = raw || legacy;

  if (value === 'tcp' || value === 'qz-tray') return 'tcp';
  if (value === 'mock') return 'mock';

  return import.meta.env.DEV ? 'mock' : 'tcp';
}

function parsePort(): number {
  const raw = import.meta.env.VITE_ZEBRA_PRINTER_PORT as string | undefined;
  if (!raw) return 9100;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? 9100 : parsed;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _config: PrintEnvConfig | null = null;
let _warnings: ConfigWarning[] | null = null;

/** Parsed and validated printer config from env vars. Cached after first call. */
export function getPrintEnvConfig(): PrintEnvConfig {
  if (_config) return _config;

  _config = {
    mode: parseMode(),
    printerName: (import.meta.env.VITE_ZEBRA_PRINTER_NAME as string | undefined)?.trim() || null,
    printerIp: (import.meta.env.VITE_ZEBRA_PRINTER_IP as string | undefined)?.trim() || null,
    printerPort: parsePort(),
    mockDownload: import.meta.env.VITE_PRINT_MOCK_DOWNLOAD === 'true',
  };

  _warnings = validateConfig(_config);

  // Log config on first access
  const tag = 'print-config';
  console.log(
    `%c🖨️ Printer config: mode=${_config.mode}, name=${_config.printerName || '(none)'}, ip=${_config.printerIp || '(none)'}:${_config.printerPort}`,
    'color: #6366f1; font-weight: bold',
  );

  if (_warnings.length > 0) {
    for (const w of _warnings) {
      console.warn(`⚠️ [${tag}] ${w.field}: ${w.message}`);
    }
  }

  return _config;
}

/** Validation warnings from the current config (empty = all good). */
export function getPrintConfigWarnings(): ConfigWarning[] {
  if (!_warnings) getPrintEnvConfig(); // force parse
  return _warnings!;
}

/** Quick check: is the config valid for actual printing? */
export function isPrintConfigValid(): boolean {
  return getPrintConfigWarnings().length === 0;
}
