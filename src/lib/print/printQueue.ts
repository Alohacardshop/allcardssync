import { sha1Hex } from "./hash";
import { logger } from "@/lib/logger";
import { withBackoff } from "@/lib/utils/backoff";

export type QueueItem = { 
  zpl: string; 
  qty?: number; 
  usePQ?: boolean;
  _skipCutTail?: boolean;
  _retryCount?: number;
};

export type CutMode = "none" | "end-of-batch";

export interface PrintQueueOptions {
  flushMs?: number;
  batchMax?: number;
  cutMode?: CutMode;
  endCutTail?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  onDeadLetter?: (items: QueueItem[], error: Error) => void;
}

const MAX_PAYLOAD_BYTES = 250_000;
const SUPPRESS_MS = 3000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const PROCESSING_TIMEOUT_MS = 30000;

function byteLen(s: string) { 
  return new Blob([s]).size; 
}

type Transport = (payload: string) => Promise<void>;

export class PrintQueue {
  private q: QueueItem[] = [];
  private running = false;
  private timer: any = null;
  private recent = new Map<string, number>();
  private readonly MAX_RECENT = 1000;
  private processingStartTime: number | null = null;
  private deadLetterQueue: { items: QueueItem[]; error: Error; timestamp: number }[] = [];

  constructor(
    private send: Transport,
    private opts: PrintQueueOptions = {}
  ) {}

  // Option A: pure enqueue (no coalescing)
  enqueue(item: QueueItem) { 
    this.q.push(item); 
    this.scheduleFlush(); 
  }
  
  // Enqueue single item that bypasses cut tail logic
  enqueueSingle(item: QueueItem) {
    this.q.push({ ...item, _skipCutTail: true });
    this.scheduleFlush(0);
  }
  
  enqueueMany(items: QueueItem[]) { 
    this.q.push(...items); 
    this.scheduleFlush(0); 
  }

  // Dedupe identical job requests in quick succession (UI double click protection)
  public async enqueueSafe(item: QueueItem) {
    const key = await sha1Hex(`${item.zpl}|${item.qty ?? 1}`);
    const now = Date.now();
    
    // Clean up expired entries
    for (const [k, exp] of [...this.recent.entries()]) {
      if (exp <= now) this.recent.delete(k);
    }
    
    // Prevent unbounded growth
    if (this.recent.size > this.MAX_RECENT) {
      const oldestKeys = Array.from(this.recent.entries())
        .sort((a, b) => a[1] - b[1])
        .slice(0, 100)
        .map(([k]) => k);
      oldestKeys.forEach(k => this.recent.delete(k));
      logger.debug('[print_queue_cleanup]', { removed: oldestKeys.length, remaining: this.recent.size }, 'print-queue');
    }
    
    const exp = this.recent.get(key);
    if (exp && exp > now) { 
      logger.warn("[print_suppressed_duplicate]", { key }, 'print-queue'); 
      return; 
    }
    
    this.recent.set(key, now + SUPPRESS_MS);
    this.enqueue(item);
  }

  public size() { 
    return this.q.length; 
  }
  
  public clear() { 
    this.q = []; 
  }
  
  public getDeadLetterQueue() {
    return [...this.deadLetterQueue];
  }
  
  public clearDeadLetterQueue() {
    this.deadLetterQueue = [];
  }
  
  public isStuck(): boolean {
    if (!this.running || !this.processingStartTime) return false;
    return Date.now() - this.processingStartTime > PROCESSING_TIMEOUT_MS;
  }
  
  public forceReset() {
    logger.warn('[print_queue_force_reset]', { queueSize: this.q.length, running: this.running }, 'print-queue');
    this.running = false;
    this.processingStartTime = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
  
  public async flushNow() { 
    if (this.timer) { 
      clearTimeout(this.timer); 
      this.timer = null; 
    } 
    if (!this.running && this.q.length) {
      await this.process(); 
    }
  }

  private scheduleFlush(ms = this.opts.flushMs ?? 500) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.process(), ms);
  }

  private withQty(zpl: string, qty: number, usePQ: boolean) {
    if (qty <= 1) return zpl;
    if (!usePQ) {
      // Repeat the ZPL for each copy
      return Array.from({ length: qty }, () => zpl).join("\n");
    }
    
    // Use ^PQ command for copies - first try to replace existing ^PQ
    const existingPQ = zpl.match(/\^PQ\d+/);
    if (existingPQ) {
      return zpl.replace(/\^PQ\d+[,\d\w]*/, `^PQ${qty}`);
    }
    
    // No existing ^PQ, inject before ^XZ
    const xzIndex = zpl.lastIndexOf('^XZ');
    if (xzIndex === -1) {
      // No ^XZ found, just append
      return zpl + `\n^PQ${qty}`;
    }
    
    return zpl.substring(0, xzIndex) + `^PQ${qty}\n^XZ`;
  }

  private async sendWithRetry(payload: string, batchItems: QueueItem[]): Promise<void> {
    const maxRetries = this.opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    const baseDelay = this.opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    
    try {
      await withBackoff(
        () => this.send(payload),
        `print_batch_${Date.now()}`,
        {
          maxRetries,
          baseDelay,
          maxDelay: baseDelay * 8,
          jitter: true,
          retryCondition: (error: any) => {
            // Retry on network errors, timeouts, or transient failures
            if (error?.message?.includes('timeout')) return true;
            if (error?.message?.includes('network')) return true;
            if (error?.message?.includes('ECONNREFUSED')) return true;
            if (error?.message?.includes('ETIMEDOUT')) return true;
            // Don't retry on configuration errors
            if (error?.message?.includes('No printer configured')) return false;
            if (error?.message?.includes('not connected')) return false;
            // Default: retry unknown errors
            return true;
          }
        }
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('[print_batch_failed_after_retries]', err, { 
        batchSize: batchItems.length,
        maxRetries 
      }, 'print-queue');
      
      // Move to dead letter queue
      this.deadLetterQueue.push({
        items: batchItems,
        error: err,
        timestamp: Date.now()
      });
      
      // Call dead letter callback if provided
      if (this.opts.onDeadLetter) {
        try {
          this.opts.onDeadLetter(batchItems, err);
        } catch (callbackError) {
          logger.error('[dead_letter_callback_error]', 
            callbackError instanceof Error ? callbackError : new Error(String(callbackError)), 
            undefined, 'print-queue');
        }
      }
      
      throw error;
    }
  }

  private async process() {
    if (this.running) {
      // Check for stuck processing
      if (this.isStuck()) {
        logger.warn('[print_queue_stuck_detected]', { 
          processingTime: Date.now() - (this.processingStartTime || 0) 
        }, 'print-queue');
        this.forceReset();
      } else {
        return;
      }
    }
    
    this.running = true;
    this.processingStartTime = Date.now();
    
    try {
      const max = this.opts.batchMax ?? 120;
      const cutMode: CutMode = this.opts.cutMode ?? "none";

      while (this.q.length) {
        const batch = this.q.splice(0, max);
        const parts: string[] = [];
        
        for (const it of batch) {
          const qty = it.qty && it.qty > 1 ? it.qty : 1;
          const usePQ = it.usePQ !== false;
          parts.push(this.withQty(it.zpl, qty, usePQ));
        }
        
        let payload = parts.join("\n^JUS\n");

        // Only append cut tail for multi-item batches
        const shouldSkipCutTail = batch.some(item => item._skipCutTail);
        if (cutMode === "end-of-batch" && this.opts.endCutTail && batch.length > 1 && !shouldSkipCutTail) {
          payload = `${payload}\n${this.opts.endCutTail}`;
          logger.debug("[cut_tail_added]", { batchSize: batch.length }, 'print-queue');
        } else if (shouldSkipCutTail) {
          logger.debug("[cut_tail_skipped]", { reason: "single_label_mode" }, 'print-queue');
        }

        // Split big payloads at ^XA boundaries
        if (byteLen(payload) > MAX_PAYLOAD_BYTES) {
          const blocks = payload.split(/\n(?=\^XA)/);
          let chunk = "";
          
          for (const b of blocks) {
            const next = chunk ? chunk + "\n" + b : b;
            if (byteLen(next) > MAX_PAYLOAD_BYTES) {
              if (chunk) { 
                logger.info("[print_batch_send]", { bytes: byteLen(chunk) }, 'print-queue'); 
                await this.sendWithRetry(chunk, batch);
              }
              chunk = b;
            } else {
              chunk = next;
            }
          }
          
          if (chunk) { 
            logger.info("[print_batch_send]", { bytes: byteLen(chunk) }, 'print-queue'); 
            await this.sendWithRetry(chunk, batch);
          }
        } else {
          logger.info("[print_batch_send]", { bytes: byteLen(payload) }, 'print-queue');
          await this.sendWithRetry(payload, batch);
        }
      }
    } catch (error) {
      // Error already logged in sendWithRetry, just ensure we clean up
      logger.error('[print_queue_process_error]', 
        error instanceof Error ? error : new Error(String(error)), 
        undefined, 'print-queue');
    } finally { 
      this.running = false;
      this.processingStartTime = null;
    }
  }
}
