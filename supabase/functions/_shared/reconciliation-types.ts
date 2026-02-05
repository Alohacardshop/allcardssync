 // Reconciliation Types and Interfaces
 
 export type ReconcileMode = 'full' | 'drift_only' | 'missing_only';
 
 export interface LocationStats {
   location_gid: string;
   location_name: string;
   items_checked: number;
   drift_detected: number;
   drift_fixed: number;
   errors: number;
 }
 
 export interface ReconcileStats {
   items_checked: number;
   drift_detected: number;
   drift_fixed: number;
   errors: number;
   skipped_locked: number;
   levels_fetched: number;
   location_stats: Map<string, LocationStats>;
 }
 
 export interface ReconcileRunResult {
   success: boolean;
   run_id: string | null;
   fetch_method: string;
   stats: {
     items_checked: number;
     drift_detected: number;
     drift_fixed: number;
     errors: number;
     skipped_locked: number;
     locations_processed: number;
   };
   error?: string;
   duration_ms?: number;
 }
 
 export interface ReconcileRequest {
   mode?: ReconcileMode;
   store_key?: string;
   dry_run?: boolean;
   max_items?: number;
 }
 
 export interface ReconcileResponse {
   success: boolean;
   mode: ReconcileMode;
   dry_run: boolean;
   duration_ms: number;
   stores_processed: number;
   results: Record<string, ReconcileRunResult>;
   errors?: string[];
 }
 
 // Error codes for clear reporting
 export const ReconcileErrorCodes = {
   CREDENTIALS_MISSING: 'CREDENTIALS_MISSING',
   BULK_OP_FAILED: 'BULK_OP_FAILED',
   RATE_LIMITED: 'RATE_LIMITED',
   DATABASE_ERROR: 'DATABASE_ERROR',
   UNKNOWN: 'UNKNOWN',
 } as const;
 
 export type ReconcileErrorCode = typeof ReconcileErrorCodes[keyof typeof ReconcileErrorCodes];
 
 export class ReconcileError extends Error {
   constructor(
     message: string,
     public code: ReconcileErrorCode,
     public details?: Record<string, unknown>
   ) {
     super(message);
     this.name = 'ReconcileError';
   }
 }