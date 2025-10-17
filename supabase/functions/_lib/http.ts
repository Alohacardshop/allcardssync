// Resilient HTTP client with timeout, exponential backoff + jitter

interface FetchOptions {
  tries?: number;
  timeoutMs?: number;
  baseDelay?: number;
}

/**
 * Fetch with automatic retries, timeout, and exponential backoff
 * @throws Error after all retries exhausted
 */
export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  { tries = 5, timeoutMs = 15000, baseDelay = 300 }: FetchOptions = {}
): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 0; attempt < tries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeout);
      lastErr = error;

      // Don't retry on last attempt
      if (attempt < tries - 1) {
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastErr;
}

/**
 * Fetch with retries but return Response (not JSON parsed)
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  { tries = 5, timeoutMs = 15000, baseDelay = 300 }: FetchOptions = {}
): Promise<Response> {
  let lastErr: unknown;

  for (let attempt = 0; attempt < tries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastErr = error;

      if (attempt < tries - 1) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastErr;
}
