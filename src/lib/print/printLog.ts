/**
 * Print Job Log
 *
 * Lightweight localStorage-backed log of every print attempt.
 * Keeps the last 500 entries with automatic pruning.
 *
 * To upgrade later: swap the save/load functions to use Supabase
 * (insert into a `print_jobs` table) — the PrintLogEntry shape
 * maps directly to a DB row.
 */

import type { TransportMode } from './transports/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrintLogEntry {
  id: string;
  timestamp: string;          // ISO 8601
  mode: TransportMode;
  title: string;
  quantity: number;
  success: boolean;
  error?: string;
  /** ZPL byte count (not the full ZPL — keep logs small) */
  zplBytes: number;
}

// ---------------------------------------------------------------------------
// Storage (swap this section for DB-backed later)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'print-job-log';
const MAX_ENTRIES = 500;

function loadAll(): PrintLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(entries: PrintLogEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage full — silently drop oldest half
    const trimmed = entries.slice(-Math.floor(MAX_ENTRIES / 2));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed)); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Append a log entry. Auto-prunes to MAX_ENTRIES. */
export function logPrintJob(entry: Omit<PrintLogEntry, 'id' | 'timestamp'>): PrintLogEntry {
  const full: PrintLogEntry = {
    ...entry,
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
  };

  const entries = loadAll();
  entries.push(full);

  // Prune oldest if over limit
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }

  saveAll(entries);
  return full;
}

/** Get all log entries, newest first. */
export function getPrintLog(): PrintLogEntry[] {
  return loadAll().reverse();
}

/** Clear the entire log. */
export function clearPrintLog() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Summary stats from the current log. */
export function getPrintLogStats() {
  const entries = loadAll();
  const total = entries.length;
  const succeeded = entries.filter((e) => e.success).length;
  const failed = total - succeeded;
  const totalLabels = entries.reduce((sum, e) => sum + e.quantity, 0);
  return { total, succeeded, failed, totalLabels };
}
