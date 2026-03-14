/**
 * Print System Types
 *
 * Single source of truth for printer config, requests, results, and transport.
 * Designed for one Zebra ZD611 now; structured so adding printers later
 * means extending these types, not rewriting them.
 */

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/** A transport takes a ZPL payload and delivers it to a printer. */
export type PrintTransport = (payload: string) => Promise<void>;

/**
 * Available transport modes.
 * - mock:    logs ZPL, no hardware needed (dev default)
 * - tcp:     sends raw ZPL to Zebra on port 9100 via QZ Tray (prod default)
 * - qz-tray: alias for tcp (legacy compat)
 */
export type TransportMode = 'mock' | 'tcp' | 'qz-tray';

// ---------------------------------------------------------------------------
// Printer Config
// ---------------------------------------------------------------------------

/** Minimal config for one printer. Add fields (ip, location) when needed. */
export interface PrinterConfig {
  /** OS-level printer name as seen by QZ Tray */
  name: string;
}

// ---------------------------------------------------------------------------
// Print Request
// ---------------------------------------------------------------------------

/** What the caller sends when requesting a print job. */
export interface PrintRequest {
  /** Raw ZPL payload */
  zpl: string;
  /** Number of copies (default 1) */
  copies?: number;
  /** Target printer — omit to use the single configured printer */
  printerId?: string;
  /** Caller-defined label for logging / job tracking */
  title?: string;
}

// ---------------------------------------------------------------------------
// Print Result
// ---------------------------------------------------------------------------

export type PrintJobStatus = 'success' | 'error' | 'queued';

export interface PrintResult {
  success: boolean;
  /** Human-readable status message */
  message?: string;
  /** Error detail when success=false */
  error?: string;
  /** Job identifier for tracking / reprint */
  jobId?: string;
  /** Resolved status — defaults to success/error based on `success` flag */
  status?: PrintJobStatus;
}

// ---------------------------------------------------------------------------
// Printer Status
// ---------------------------------------------------------------------------

export interface PrinterStatus {
  ready: boolean;
  paused: boolean;
  headOpen: boolean;
  mediaOut: boolean;
  /** Raw status string from the printer / bridge */
  raw: string;
}
