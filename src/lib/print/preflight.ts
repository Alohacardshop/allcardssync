/**
 * Print Preflight Validation
 *
 * Single reusable check that runs before any print attempt.
 * Returns actionable, staff-friendly error messages.
 */

import { getPrintEnvConfig, isPrintConfigValid, getPrintConfigWarnings } from './envConfig';
import type { JobVars } from '@/lib/labels/types';

export interface PreflightResult {
  ok: boolean;
  errors: string[];
}

const VALID_MODES = ['mock', 'tcp', 'qz-tray'];
const MAX_COPIES = 500;

/**
 * Validate that the print system is ready before sending a job.
 *
 * @param zpl      - Final ZPL string (optional — skip ZPL checks if not yet rendered)
 * @param copies   - Requested copy count
 * @param vars     - Resolved template variables (optional — checks barcode/sku presence)
 */
export function runPreflight(opts: {
  zpl?: string;
  copies?: number;
  vars?: JobVars;
  requireBarcode?: boolean;
}): PreflightResult {
  const errors: string[] = [];
  const config = getPrintEnvConfig();

  // 1. Mode
  if (!VALID_MODES.includes(config.mode)) {
    errors.push(`Printer mode "${config.mode}" is not valid. Expected: mock or tcp.`);
  }

  // 2. Config (tcp only)
  if (config.mode !== 'mock' && !isPrintConfigValid()) {
    const warnings = getPrintConfigWarnings();
    for (const w of warnings) {
      if (w.field.includes('PRINTER_NAME')) {
        errors.push('Printer name is missing from config. Set VITE_ZEBRA_PRINTER_NAME in your .env file.');
      } else {
        errors.push(`${w.field}: ${w.message}`);
      }
    }
  }

  // 3. Copies
  const copies = opts.copies ?? 1;
  if (!Number.isFinite(copies) || copies < 1) {
    errors.push('Quantity must be at least 1.');
  } else if (copies > MAX_COPIES) {
    errors.push(`Quantity ${copies} exceeds the maximum of ${MAX_COPIES}. Print in smaller batches.`);
  }

  // 4. ZPL presence
  if (opts.zpl !== undefined) {
    const trimmed = (opts.zpl || '').trim();
    if (trimmed.length === 0) {
      errors.push('Label design is empty — nothing to print.');
    } else if (!trimmed.includes('^XA')) {
      errors.push('Label design is invalid — missing ZPL start command (^XA).');
    }
  }

  // 5. Barcode field
  if (opts.vars) {
    const barcode = opts.vars.BARCODE;
    if (opts.requireBarcode && (!barcode || barcode.trim().length === 0)) {
      errors.push('Barcode value is empty. Every label needs a scannable barcode.');
    }
    if (barcode) {
      const barcodeError = validateBarcodePayload(barcode);
      if (barcodeError) errors.push(barcodeError);
    }
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Barcode payload validation (Code 128)
// ---------------------------------------------------------------------------

/**
 * Validate a barcode value for Code 128.
 * Returns an error string or null if valid.
 */
export function validateBarcodePayload(value: string): string | null {
  if (!value || typeof value !== 'string') return 'Barcode value is empty.';

  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Barcode value is empty.';

  // Reject newlines / carriage returns
  if (/[\r\n]/.test(trimmed)) {
    return 'Barcode value contains line breaks, which are not allowed.';
  }

  // Code 128 supports ASCII 0–127 only
  if (/[^\x00-\x7F]/.test(trimmed)) {
    return 'Barcode value contains non-ASCII characters that the printer cannot encode.';
  }

  // Reject ZPL control characters that would corrupt the label
  if (/[\^~]/.test(trimmed)) {
    return 'Barcode value contains special characters (^ or ~) that conflict with ZPL.';
  }

  // Sanity length check — Code 128 technically supports long strings but practical limit ~48 chars
  if (trimmed.length > 48) {
    return `Barcode value is ${trimmed.length} characters — too long to scan reliably. Keep it under 48.`;
  }

  return null;
}

/**
 * Sanitize a barcode value: trim, strip newlines, validate.
 * Returns { value, error } — use value only when error is null.
 */
export function sanitizeBarcodeValue(raw: string): { value: string; error: string | null } {
  const cleaned = (raw || '').trim().replace(/[\r\n]/g, '');
  const error = validateBarcodePayload(cleaned);
  return { value: cleaned, error };
}
