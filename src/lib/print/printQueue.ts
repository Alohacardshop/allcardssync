import { sha1Hex } from "./hash";

export type QueueItem = { 
  zpl: string; 
  qty?: number; 
  usePQ?: boolean; 
};

export type CutMode = "none" | "end-of-batch";

const MAX_PAYLOAD_BYTES = 250_000;
const SUPPRESS_MS = 3000;

function byteLen(s: string) { 
  return new Blob([s]).size; 
}

type Transport = (payload: string) => Promise<void>;

export class PrintQueue {
  private q: QueueItem[] = [];
  private running = false;
  private timer: any = null;
  private recent = new Map<string, number>();

  constructor(
    private send: Transport,
    private opts: { 
      flushMs?: number; 
      batchMax?: number; 
      cutMode?: CutMode; 
      endCutTail?: string 
    } = {}
  ) {}

  // Option A: pure enqueue (no coalescing)
  enqueue(item: QueueItem) { 
    this.q.push(item); 
    this.scheduleFlush(); 
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
    
    const exp = this.recent.get(key);
    if (exp && exp > now) { 
      console.warn("[print_suppressed_duplicate]", { key }); 
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
    return usePQ
      ? zpl.replace(/\^PQ(\d+)(?=[^\^]*\^XZ\b)/, `^PQ${qty}`)
      : Array.from({ length: qty }, () => zpl).join("\n");
  }

  private async process() {
    if (this.running) return;
    this.running = true;
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
        
        let payload = parts.join("\n");

        // Append single cut tail once at end of batch (ZD410-friendly)
        if (cutMode === "end-of-batch" && this.opts.endCutTail) {
          payload = `${payload}\n${this.opts.endCutTail}`;
        }

        // Split big payloads at ^XA boundaries
        if (byteLen(payload) > MAX_PAYLOAD_BYTES) {
          const blocks = payload.split(/\n(?=\^XA)/);
          let chunk = "";
          
          for (const b of blocks) {
            const next = chunk ? chunk + "\n" + b : b;
            if (byteLen(next) > MAX_PAYLOAD_BYTES) {
              if (chunk) { 
                console.info("[print_batch_send]", { bytes: byteLen(chunk) }); 
                await this.send(chunk); 
              }
              chunk = b;
            } else {
              chunk = next;
            }
          }
          
          if (chunk) { 
            console.info("[print_batch_send]", { bytes: byteLen(chunk) }); 
            await this.send(chunk); 
          }
        } else {
          console.info("[print_batch_send]", { bytes: byteLen(payload) });
          await this.send(payload);
        }
      }
    } finally { 
      this.running = false; 
    }
  }
}