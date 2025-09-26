export type QueueItem = {
  zpl: string;       // full ^XA…^XZ for ONE label (ends with ^PQ1 and ^XZ)
  qty?: number;      // default 1
  usePQ?: boolean;   // default true (repeat via ^PQ)
};

export type CutMode = "none" | "per-label" | "end-of-batch";

type Transport = (payload: string) => Promise<void>;

export class PrintQueue {
  private q: QueueItem[] = [];
  private running = false;
  private timer: any = null;

  constructor(
    private send: Transport,
    private opts: {
      flushMs?: number;
      batchMax?: number;
      cutMode?: CutMode;
      endCutTail?: string; // appended once at end of batch when cutMode = "end-of-batch"
    } = {}
  ) {}

  enqueue(item: QueueItem) { this.q.push(item); this.scheduleFlush(); }
  enqueueMany(items: QueueItem[]) { this.q.push(...items); this.scheduleFlush(0); }

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
        
        console.log('🔄 Print Queue: Processing batch:', {
          itemCount: batch.length,
          cutMode,
          batchMax: max
        });

        const parts: string[] = [];
        for (const it of batch) {
          const qty = it.qty && it.qty > 1 ? it.qty : 1;
          const usePQ = it.usePQ !== false;
          const processedZpl = this.withQty(it.zpl, qty, usePQ);
          parts.push(processedZpl);
          
          console.log('📝 Queue Item:', {
            originalLength: it.zpl.length,
            processedLength: processedZpl.length,
            qty,
            usePQ,
            preview: processedZpl.substring(0, 80) + '...'
          });
        }

        let payload = parts.join("\n");

        // ✅ cut once at the very end of the whole batch
        if (cutMode === "end-of-batch" && this.opts.endCutTail) {
          payload = `${payload}\n${this.opts.endCutTail}`;
          console.log('✂️ Queue: Added end-of-batch cut command');
        }

        console.log('📤 Queue: Final payload being sent:');
        console.log('='.repeat(60));
        console.log(payload);
        console.log('='.repeat(60));
        console.log('📊 Payload stats:', {
          totalLength: payload.length,
          lineCount: payload.split('\n').length,
          labelCount: parts.length
        });

        await this.send(payload);
      }
    } finally {
      this.running = false;
    }
  }
}