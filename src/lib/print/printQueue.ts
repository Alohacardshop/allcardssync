import { sha1Hex } from "./hash";
import { logger } from "@/lib/logger";
import { withBackoff } from "@/lib/utils/backoff";

export type QueueItem = { 
  zpl: string; 
  qty?: number; 
  usePQ?: boolean;
  _skipCutTail?: boolean;
  _retryCount?: number;
  _sentHash?: string; // Tracks if this item was already sent (for retry deduplication)
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
  onPartialSuccess?: (sentCount: number, totalCount: number, chunkIndex: number) => void;
}

const MAX_PAYLOAD_BYTES = 250_000;
const SUPPRESS_MS = 3000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const PROCESSING_TIMEOUT_MS = 30000;
const DEAD_LETTER_MAX_SIZE = 200;
const DEAD_LETTER_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function byteLen(s: string) {
  return new Blob([s]).size; 
}

type Transport = (payload: string) => Promise<void>;

/** Represents a chunk of ZPL with its associated queue items */
interface PayloadChunk {
  payload: string;
  items: QueueItem[];
  chunkIndex: number;
}

export class PrintQueue {
  private q: QueueItem[] = [];
  private running = false;
  private timer: any = null;
  private recent = new Map<string, number>();
  private readonly MAX_RECENT = 1000;
  private processingStartTime: number | null = null;
  private deadLetterQueue: { items: QueueItem[]; error: Error; timestamp: number }[] = [];
  private sentHashes = new Set<string>(); // Global set to prevent duplicate sends across retries

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
    this.cleanupDeadLetterQueue();
    return [...this.deadLetterQueue];
  }
  
  public clearDeadLetterQueue() {
    this.deadLetterQueue = [];
  }
  
  /** Remove expired entries and enforce max size */
  private cleanupDeadLetterQueue() {
    const now = Date.now();
    
    // Remove expired entries (older than TTL)
    const beforeCount = this.deadLetterQueue.length;
    this.deadLetterQueue = this.deadLetterQueue.filter(
      entry => (now - entry.timestamp) < DEAD_LETTER_TTL_MS
    );
    
    // Enforce max size (keep most recent)
    if (this.deadLetterQueue.length > DEAD_LETTER_MAX_SIZE) {
      // Sort by timestamp descending and keep only the most recent
      this.deadLetterQueue.sort((a, b) => b.timestamp - a.timestamp);
      this.deadLetterQueue = this.deadLetterQueue.slice(0, DEAD_LETTER_MAX_SIZE);
    }
    
    const removedCount = beforeCount - this.deadLetterQueue.length;
    if (removedCount > 0) {
      logger.debug('[dead_letter_cleanup]', { 
        removed: removedCount, 
        remaining: this.deadLetterQueue.length 
      }, 'print-queue');
    }
  }
  
  /** Add entry to dead letter queue with automatic cleanup */
  private addToDeadLetterQueue(items: QueueItem[], error: Error) {
    this.deadLetterQueue.push({
      items,
      error,
      timestamp: Date.now()
    });
    
    // Cleanup after adding
    this.cleanupDeadLetterQueue();
  }
  
  public clearSentHashes() {
    this.sentHashes.clear();
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

  /** Generate a unique hash for an item to track send status */
  private async getItemHash(item: QueueItem): Promise<string> {
    return sha1Hex(`${item.zpl}|${item.qty ?? 1}|${Date.now()}`);
  }

  /** Check if all items in a chunk have already been sent */
  private areAllItemsSent(items: QueueItem[]): boolean {
    return items.every(item => item._sentHash && this.sentHashes.has(item._sentHash));
  }

  /** Mark items as sent */
  private markItemsSent(items: QueueItem[]) {
    for (const item of items) {
      if (item._sentHash) {
        this.sentHashes.add(item._sentHash);
      }
    }
  }

  private async sendChunkWithRetry(chunk: PayloadChunk): Promise<{ success: boolean; sentItems: QueueItem[]; failedItems: QueueItem[] }> {
    const { payload, items, chunkIndex } = chunk;
    const maxRetries = this.opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    const baseDelay = this.opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    
    // Skip if all items were already sent (retry deduplication)
    if (this.areAllItemsSent(items)) {
      logger.info('[print_chunk_skipped_already_sent]', { 
        chunkIndex, 
        itemCount: items.length 
      }, 'print-queue');
      return { success: true, sentItems: items, failedItems: [] };
    }

    // Filter to only unsent items for this chunk
    const unsentItems = items.filter(item => !item._sentHash || !this.sentHashes.has(item._sentHash));
    
    if (unsentItems.length === 0) {
      logger.info('[print_chunk_all_items_sent]', { chunkIndex }, 'print-queue');
      return { success: true, sentItems: items, failedItems: [] };
    }

    logger.info('[print_chunk_send_start]', { 
      chunkIndex, 
      totalItems: items.length,
      unsentItems: unsentItems.length,
      bytes: byteLen(payload) 
    }, 'print-queue');
    
    try {
      await withBackoff(
        () => this.send(payload),
        `print_chunk_${chunkIndex}_${Date.now()}`,
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
      
      // Mark all items in this chunk as sent
      this.markItemsSent(items);
      
      logger.info('[print_chunk_send_success]', { 
        chunkIndex, 
        itemCount: items.length 
      }, 'print-queue');
      
      // Notify partial success
      if (this.opts.onPartialSuccess) {
        this.opts.onPartialSuccess(items.length, items.length, chunkIndex);
      }
      
      return { success: true, sentItems: items, failedItems: [] };
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      logger.error('[print_chunk_failed_after_retries]', err, { 
        chunkIndex,
        itemCount: items.length,
        maxRetries 
      }, 'print-queue');
      
      // Only add unsent items to dead letter queue (with cleanup)
      this.addToDeadLetterQueue(unsentItems, err);
      
      // Call dead letter callback if provided
      if (this.opts.onDeadLetter) {
        try {
          this.opts.onDeadLetter(unsentItems, err);
        } catch (callbackError) {
          logger.error('[dead_letter_callback_error]', 
            callbackError instanceof Error ? callbackError : new Error(String(callbackError)), 
            undefined, 'print-queue');
        }
      }
      
      return { success: false, sentItems: [], failedItems: unsentItems };
    }
  }

  /** Split payload into chunks, tracking which items belong to each chunk */
  private splitPayloadIntoChunks(batch: QueueItem[]): PayloadChunk[] {
    const parts: { zpl: string; item: QueueItem }[] = [];
    
    for (const item of batch) {
      const qty = item.qty && item.qty > 1 ? item.qty : 1;
      const usePQ = item.usePQ !== false;
      parts.push({ 
        zpl: this.withQty(item.zpl, qty, usePQ), 
        item 
      });
    }
    
    const cutMode: CutMode = this.opts.cutMode ?? "none";
    const shouldSkipCutTail = batch.some(item => item._skipCutTail);
    
    // Build full payload first
    let fullPayload = parts.map(p => p.zpl).join("\n^JUS\n");
    
    // Add cut tail if needed
    if (cutMode === "end-of-batch" && this.opts.endCutTail && batch.length > 1 && !shouldSkipCutTail) {
      fullPayload = `${fullPayload}\n${this.opts.endCutTail}`;
      logger.debug("[cut_tail_added]", { batchSize: batch.length }, 'print-queue');
    } else if (shouldSkipCutTail) {
      logger.debug("[cut_tail_skipped]", { reason: "single_label_mode" }, 'print-queue');
    }

    // If payload fits, return single chunk with all items
    if (byteLen(fullPayload) <= MAX_PAYLOAD_BYTES) {
      return [{
        payload: fullPayload,
        items: batch,
        chunkIndex: 0
      }];
    }

    // Need to split - track items per chunk
    const chunks: PayloadChunk[] = [];
    let currentChunkZpls: string[] = [];
    let currentChunkItems: QueueItem[] = [];
    let chunkIndex = 0;

    for (const { zpl, item } of parts) {
      const testPayload = currentChunkZpls.length > 0 
        ? currentChunkZpls.join("\n^JUS\n") + "\n^JUS\n" + zpl
        : zpl;
      
      if (byteLen(testPayload) > MAX_PAYLOAD_BYTES && currentChunkZpls.length > 0) {
        // Finalize current chunk
        chunks.push({
          payload: currentChunkZpls.join("\n^JUS\n"),
          items: [...currentChunkItems],
          chunkIndex
        });
        
        logger.debug('[print_chunk_created]', { 
          chunkIndex, 
          itemCount: currentChunkItems.length,
          bytes: byteLen(currentChunkZpls.join("\n^JUS\n"))
        }, 'print-queue');
        
        chunkIndex++;
        currentChunkZpls = [zpl];
        currentChunkItems = [item];
      } else {
        currentChunkZpls.push(zpl);
        currentChunkItems.push(item);
      }
    }

    // Don't forget the last chunk
    if (currentChunkZpls.length > 0) {
      let lastPayload = currentChunkZpls.join("\n^JUS\n");
      
      // Add cut tail only to the last chunk
      if (cutMode === "end-of-batch" && this.opts.endCutTail && batch.length > 1 && !shouldSkipCutTail) {
        lastPayload = `${lastPayload}\n${this.opts.endCutTail}`;
      }
      
      chunks.push({
        payload: lastPayload,
        items: [...currentChunkItems],
        chunkIndex
      });
      
      logger.debug('[print_chunk_created]', { 
        chunkIndex, 
        itemCount: currentChunkItems.length,
        bytes: byteLen(lastPayload),
        isLast: true
      }, 'print-queue');
    }

    logger.info('[print_payload_split]', { 
      totalItems: batch.length,
      chunkCount: chunks.length,
      totalBytes: byteLen(fullPayload)
    }, 'print-queue');

    return chunks;
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
    
    // Clear sent hashes at start of new processing run
    this.sentHashes.clear();
    
    try {
      const max = this.opts.batchMax ?? 120;
      let totalSent = 0;
      let totalFailed = 0;

      while (this.q.length) {
        const batch = this.q.splice(0, max);
        
        // Assign unique hashes to each item for tracking
        for (const item of batch) {
          if (!item._sentHash) {
            item._sentHash = await this.getItemHash(item);
          }
        }
        
        // Split into properly-tracked chunks
        const chunks = this.splitPayloadIntoChunks(batch);
        
        logger.info('[print_batch_process_start]', { 
          batchSize: batch.length, 
          chunkCount: chunks.length 
        }, 'print-queue');

        // Process chunks sequentially to maintain order
        for (const chunk of chunks) {
          const result = await this.sendChunkWithRetry(chunk);
          totalSent += result.sentItems.length;
          totalFailed += result.failedItems.length;
          
          // Yield to UI thread between chunks
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        logger.info('[print_batch_process_complete]', { 
          batchSize: batch.length,
          sent: totalSent,
          failed: totalFailed
        }, 'print-queue');
      }
    } catch (error) {
      logger.error('[print_queue_process_error]', 
        error instanceof Error ? error : new Error(String(error)), 
        undefined, 'print-queue');
    } finally { 
      this.running = false;
      this.processingStartTime = null;
    }
  }
}
