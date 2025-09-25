export type QueueItem = {
  zpl: string;   // must be full ^XA...^XZ for ONE label
  qty?: number;  // default 1
  usePQ?: boolean; // default true
};

type Transport = (payload: string) => Promise<void>;

export class PrintQueue {
  private q: QueueItem[] = [];
  private running = false;
  private timer: any = null;

  constructor(
    private send: Transport,
    private opts: { flushMs?: number; batchMax?: number; cutTail?: string } = {}
  ) {}

  enqueue(item: QueueItem) {
    this.q.push(item);
    this.scheduleFlush();
  }

  enqueueMany(items: QueueItem[]) {
    for (const it of items) this.q.push(it);
    this.scheduleFlush(0);
  }

  private scheduleFlush(ms = this.opts.flushMs ?? 500) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.process(), ms);
  }

  private async process() {
    if (this.running) return;
    this.running = true;
    try {
      const max = this.opts.batchMax ?? 100;
      while (this.q.length) {
        const batch = this.q.splice(0, max);
        const parts: string[] = [];
        for (const it of batch) {
          const qty = it.qty && it.qty > 1 ? it.qty : 1;
          const usePQ = it.usePQ !== false;
          if (usePQ) {
            parts.push(it.zpl.replace(/\^PQ(\d+)(?=[^\^]*\^XZ\b)/, `^PQ${qty}`));
          } else {
            parts.push(Array.from({ length: qty }, () => it.zpl).join("\n"));
          }
        }
        const payload = this.opts.cutTail ? `${parts.join("\n")}\n${this.opts.cutTail}` : parts.join("\n");
        await this.send(payload);
      }
    } finally {
      this.running = false;
    }
  }
}