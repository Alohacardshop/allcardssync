// supabase/functions/_shared/http.ts
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function fetchWithRetry(url: string, init: RequestInit = {}, opts?: { retries?: number; baseDelayMs?: number; jitter?: boolean }) {
  const retries = opts?.retries ?? 4;
  const base = opts?.baseDelayMs ?? 500;
  const jitter = opts?.jitter ?? true;

  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      if (![429, 500, 502, 503, 504].includes(res.status) || attempt >= retries) return res;
    } catch (e) {
      if (attempt >= retries) throw e;
    }
    const delay = Math.floor(base * Math.pow(2, attempt) * (jitter ? (0.75 + Math.random() * 0.5) : 1));
    await sleep(delay);
    attempt++;
  }
}